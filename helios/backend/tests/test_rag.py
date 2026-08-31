import httpx
import pytest
import pytest_asyncio
from sqlalchemy import select

from app.config import settings
from app.deps import get_llm
from app.llm_gateway.client import LLMClient
from app.main import app
from app.models import Document, DocumentChunk
from app.rag.extract import (
    ExtractionError,
    extract_text_from_bytes,
    extract_text_from_html,
)
from app.rag.service import (
    delete_document,
    get_document,
    ingest_text,
    list_documents,
    search_documents,
)
from app.rag.splitter import split_text


class FakeRagLLM(LLMClient):
    def __init__(self) -> None:
        super().__init__()

    async def embed(self, text: str):
        seed = sum(ord(c) for c in text)
        return [float(seed % 7) / 7.0, 1.0]

    async def complete(self, messages, tools=None, model=None):
        raise AssertionError("complete must not be called by the rag router")


@pytest_asyncio.fixture
async def authed_client(client):
    resp = await client.post("/api/auth/signup", json={"email": "rag@h.com", "password": "secret123"})
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return client, headers


@pytest_asyncio.fixture
async def fake_rag_llm(client):
    fake = FakeRagLLM()
    app.dependency_overrides[get_llm] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_llm, None)


async def _embed(t: str) -> list[float]:
    seed = sum(ord(c) for c in t)
    return [float(seed % 7) / 7.0, 1.0]


def _fixed_embed(vector: list[float]):
    async def _e(_t: str) -> list[float]:
        return vector

    return _e


def test_split_short_text_single_chunk():
    assert split_text("hello world") == ["hello world"]


def test_split_empty_text():
    assert split_text("") == []


def test_split_long_text_has_overlap():
    text = " ".join(f"word{i}" for i in range(400))
    chunks = split_text(text, chunk_size=200, overlap=50)
    assert len(chunks) > 1
    assert all(chunk for chunk in chunks)
    for i in range(1, len(chunks)):
        prev = chunks[i - 1]
        cur = chunks[i]
        shared = set(prev.split()) & set(cur.split())
        assert shared, "consecutive chunks must share overlap"


def test_extract_txt_and_markdown():
    assert extract_text_from_bytes(b"plain text", "notes.txt") == "plain text"
    assert extract_text_from_bytes(b"# Hello\n\nbody", "readme.md") == "# Hello\n\nbody"


def test_extract_unsupported_type_raises():
    with pytest.raises(ExtractionError):
        extract_text_from_bytes(b"data", "file.xyz")


def test_extract_html_strips_tags():
    html = "<html><body><h1>Title</h1><p>Hello <b>world</b></p><script>bad()</script></body></html>"
    text = extract_text_from_html(html)
    assert "Title" in text
    assert "Hello world" in text
    assert "bad()" not in text


def test_extract_pdf_bytes():
    data = b"%PDF-1.4 not-a-real-pdf"
    with pytest.raises(ExtractionError):
        extract_text_from_bytes(data, "doc.pdf")


async def test_ingest_text_creates_doc_and_chunks(db_session):
    text = " ".join(f"paragraph{i}" for i in range(300))
    doc = await ingest_text(db_session, user_id=1, title="report", text=text, embed=_embed)
    assert doc.id is not None
    rows = (await db_session.execute(select(DocumentChunk))).scalars().all()
    assert len(rows) > 1
    assert all(r.document_id == doc.id for r in rows)
    assert all(r.position is not None for r in rows)


async def test_list_documents_with_index_flag(db_session):
    await ingest_text(db_session, 1, "doc one", "short", embed=_embed)
    docs = await list_documents(db_session, 1)
    assert len(docs) == 1
    doc, indexed = docs[0]
    assert doc.title == "doc one"
    assert indexed is True


async def test_search_documents_scoped_and_ranked(db_session):
    await ingest_text(
        db_session, 1, "plans", "Project plans about building a rocket", embed=_fixed_embed([1.0, 0.0, 0.0])
    )
    await ingest_text(
        db_session, 1, "recipes", "Baking sourdough bread on weekends", embed=_fixed_embed([0.0, 1.0, 0.0])
    )
    await ingest_text(
        db_session, 2, "other", "someone else's secret plans", embed=_fixed_embed([1.0, 0.0, 0.0])
    )
    results = await search_documents(db_session, 1, [0.9, 0.1, 0.0], top_k=5)
    assert len(results) == 1
    assert results[0]["title"] == "plans"
    assert all("title" in r and "content" in r and "score" in r for r in results)


async def test_search_documents_filters_below_threshold(db_session):
    await ingest_text(
        db_session, 1, "plans", "Project plans about building a rocket", embed=_fixed_embed([1.0, 0.0, 0.0])
    )
    await ingest_text(
        db_session, 1, "recipes", "Baking sourdough bread on weekends", embed=_fixed_embed([0.0, 1.0, 0.0])
    )
    results = await search_documents(db_session, 1, [0.9, 0.1, 0.0], top_k=5)
    assert all(r["score"] >= settings.search_min_score for r in results)
    assert all(r["title"] != "recipes" for r in results)


async def test_search_documents_deduplicates_identical_chunks(db_session):
    chunk = "shared content about rockets"
    await ingest_text(db_session, 1, "doc one", chunk, embed=_fixed_embed([1.0, 0.0, 0.0]))
    await ingest_text(db_session, 1, "doc two", chunk, embed=_fixed_embed([1.0, 0.0, 0.0]))
    results = await search_documents(db_session, 1, [1.0, 0.0, 0.0], top_k=5)
    contents = [r["content"] for r in results]
    assert len(contents) == len(set(contents))


async def test_get_and_delete_document(db_session):
    doc = await ingest_text(db_session, 1, "temp", "some content", embed=_embed)
    assert await get_document(db_session, 1, doc.id) is not None
    assert await get_document(db_session, 2, doc.id) is None
    assert await delete_document(db_session, 1, doc.id) is True
    assert await delete_document(db_session, 1, doc.id) is False
    rows = (await db_session.execute(select(Document))).scalars().all()
    assert len(rows) == 0
    chunks = (await db_session.execute(select(DocumentChunk))).scalars().all()
    assert len(chunks) == 0


async def test_documents_router_upload_list_delete(authed_client, fake_rag_llm):
    client, headers = authed_client
    resp = await client.post(
        "/api/documents",
        files={"file": ("notes.txt", b"some project notes about rockets", "text/plain")},
        headers=headers,
    )
    assert resp.status_code == 201
    doc = resp.json()
    assert doc["title"] == "notes"
    assert doc["type"] == "file"

    resp = await client.get("/api/documents", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["indexed"] is True

    resp = await client.delete(f"/api/documents/{doc['id']}", headers=headers)
    assert resp.status_code == 204
    resp = await client.delete(f"/api/documents/{doc['id']}", headers=headers)
    assert resp.status_code == 404


async def test_documents_router_rejects_bad_extension(authed_client, fake_rag_llm):
    client, headers = authed_client
    resp = await client.post(
        "/api/documents",
        files={"file": ("data.xyz", b"garbage", "application/octet-stream")},
        headers=headers,
    )
    assert resp.status_code == 400


async def test_documents_router_search(authed_client, fake_rag_llm):
    client, headers = authed_client
    await client.post(
        "/api/documents",
        files={"file": ("notes.txt", b"rocket launch plans", "text/plain")},
        headers=headers,
    )
    resp = await client.get("/api/documents/search", params={"q": "rocket"}, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "results" in body
    assert len(body["results"]) == 1


async def test_documents_router_requires_auth(client):
    resp = await client.get("/api/documents")
    assert resp.status_code == 401
    resp = await client.post("/api/documents/url", json={"url": "http://x"}, )
    assert resp.status_code == 401


async def test_documents_router_url_success(authed_client, fake_rag_llm, monkeypatch):
    client, headers = authed_client
    html = "<html><body><h1>Article</h1><p>Details about AI safety research.</p></body></html>"

    class FakeResponse:
        status_code = 200
        text = html

        def raise_for_status(self):
            return None

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url, **kwargs):
            return FakeResponse()

    import app.rag.router as rag_router

    monkeypatch.setattr(rag_router.httpx, "AsyncClient", FakeAsyncClient)
    resp = await client.post(
        "/api/documents/url", json={"url": "https://example.com/article"}, headers=headers
    )
    assert resp.status_code == 201
    doc = resp.json()
    assert doc["type"] == "url"
    assert doc["source"] == "https://example.com/article"


async def test_documents_router_url_403_gives_hint(authed_client, fake_rag_llm, monkeypatch):
    client, headers = authed_client

    class FakeResponse:
        status_code = 403
        text = "forbidden"

        def raise_for_status(self):
            raise httpx.HTTPStatusError(
                "403", request=httpx.Request("GET", "https://example.com/blocked"), response=self
            )

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url, **kwargs):
            return FakeResponse()

    import app.rag.router as rag_router

    monkeypatch.setattr(rag_router.httpx, "AsyncClient", FakeAsyncClient)
    resp = await client.post(
        "/api/documents/url", json={"url": "https://example.com/blocked"}, headers=headers
    )
    assert resp.status_code == 400
    assert "blocked automated access" in resp.json()["detail"]
