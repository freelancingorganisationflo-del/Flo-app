import httpx
import pytest
import pytest_asyncio

from app.search.service import (
    SearchError,
    fetch_page,
    is_safe_url,
    search_web,
    unwrap_ddg_url,
)


DDG_HTML = """
<html><body>
  <div class="result">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fai">AI news</a>
    <a class="result__snippet">Latest developments in artificial intelligence.</a>
  </div>
  <div class="result">
    <a class="result__a" href="https://example.org/safety">AI safety</a>
    <a class="result__snippet">Research on AI alignment and safety.</a>
  </div>
  <div class="result">
    <a class="result__a" href="http://127.0.0.1/secret">Local</a>
    <a class="result__snippet">should be skipped</a>
  </div>
</body></html>
"""

IA_JSON = {
    "Heading": "Artificial intelligence",
    "AbstractText": "Intelligence demonstrated by machines.",
    "AbstractURL": "https://en.wikipedia.org/wiki/Artificial_intelligence",
}


class FakeResponse:
    def __init__(self, url, text="", json_data=None, status_code=200, headers=None):
        self.url = url
        self.text = text
        self._json = json_data
        self.status_code = status_code
        self.headers = headers or {"content-type": "text/html"}
        self.request = httpx.Request("GET", url)

    def json(self):
        if self._json is None:
            raise ValueError("no json")
        return self._json

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                f"{self.status_code}", request=self.request, response=self
            )


class FakeAsyncClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, **kwargs):
        url = str(url)
        if "api.duckduckgo.com" in url:
            return FakeResponse(url, json_data=IA_JSON, headers={"content-type": "application/json"})
        if url.startswith("https://example.com"):
            html = "<html><head><title>Example</title></head><body><p>Hello world page.</p></body></html>"
            return FakeResponse(url, text=html)
        if url.startswith("https://blocked.example"):
            return FakeResponse(url, text="nope", status_code=403)
        return FakeResponse(url, text="<html><body>ok</body></html>")

    async def post(self, url, **kwargs):
        return FakeResponse(url, text=DDG_HTML)


def test_unwrap_ddg_url():
    raw = "//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fai"
    assert unwrap_ddg_url(raw) == "https://example.com/ai"
    assert unwrap_ddg_url("https://example.org/x") == "https://example.org/x"


def test_is_safe_url():
    assert is_safe_url("https://example.com/a")
    assert is_safe_url("http://news.example.org")
    assert not is_safe_url("ftp://example.com")
    assert not is_safe_url("http://localhost/admin")
    assert not is_safe_url("http://127.0.0.1/x")
    assert not is_safe_url("http://10.0.0.5/x")
    assert not is_safe_url("http://192.168.1.1/x")
    assert not is_safe_url("http://169.254.1.1/x")
    assert not is_safe_url("https://user:pass@example.com")
    assert not is_safe_url("not-a-url")


async def test_search_web_parses_results(monkeypatch):
    import app.search.service as svc

    monkeypatch.setattr(svc.httpx, "AsyncClient", FakeAsyncClient)
    results = await search_web("artificial intelligence", max_results=8)
    urls = [r["url"] for r in results]
    assert "https://en.wikipedia.org/wiki/Artificial_intelligence" in urls
    assert "https://example.com/ai" in urls
    assert "https://example.org/safety" in urls
    assert all("127.0.0.1" not in r["url"] for r in results)
    assert any(r["source"] == "instant" for r in results)
    assert any(r["source"] == "web" for r in results)


async def test_search_web_empty_query():
    with pytest.raises(SearchError):
        await search_web("   ")


async def test_fetch_page_extracts_text(monkeypatch):
    import app.search.service as svc

    monkeypatch.setattr(svc.httpx, "AsyncClient", FakeAsyncClient)
    page = await fetch_page("https://example.com/article")
    assert page["title"] == "Example"
    assert "Hello world page" in page["text"]
    assert page["truncated"] is False


async def test_fetch_page_blocks_private_urls():
    with pytest.raises(SearchError):
        await fetch_page("http://127.0.0.1/secret")


async def test_fetch_page_http_error(monkeypatch):
    import app.search.service as svc

    monkeypatch.setattr(svc.httpx, "AsyncClient", FakeAsyncClient)
    with pytest.raises(SearchError):
        await fetch_page("https://blocked.example/page")


@pytest_asyncio.fixture
async def authed_client(client):
    resp = await client.post("/api/auth/signup", json={"email": "search@h.com", "password": "secret123"})
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return client, headers


async def test_search_router_requires_auth(client):
    resp = await client.get("/api/search", params={"q": "ai"})
    assert resp.status_code == 401
    resp = await client.post("/api/search/fetch", json={"url": "https://example.com"})
    assert resp.status_code == 401


async def test_search_router_empty_query(authed_client):
    client, headers = authed_client
    resp = await client.get("/api/search", params={"q": "   "}, headers=headers)
    assert resp.status_code == 400


async def test_search_router_success(authed_client, monkeypatch):
    client, headers = authed_client
    import app.search.service as svc

    monkeypatch.setattr(svc.httpx, "AsyncClient", FakeAsyncClient)
    resp = await client.get("/api/search", params={"q": "ai", "limit": 5}, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["query"] == "ai"
    assert len(body["results"]) >= 1
    assert "title" in body["results"][0]
    assert "url" in body["results"][0]


async def test_fetch_router_success(authed_client, monkeypatch):
    client, headers = authed_client
    import app.search.service as svc

    monkeypatch.setattr(svc.httpx, "AsyncClient", FakeAsyncClient)
    resp = await client.post(
        "/api/search/fetch", json={"url": "https://example.com/article"}, headers=headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "Example"
    assert "Hello world" in body["text"]


async def test_fetch_router_rejects_private(authed_client):
    client, headers = authed_client
    resp = await client.post("/api/search/fetch", json={"url": "http://127.0.0.1/x"}, headers=headers)
    assert resp.status_code == 400

async def test_fetch_page_blocks_redirect_to_private(monkeypatch):
    import app.search.service as svc

    class RedirectClient(FakeAsyncClient):
        async def get(self, url, **kwargs):
            return FakeResponse("http://127.0.0.1/secret", text="nope")

    monkeypatch.setattr(svc.httpx, "AsyncClient", RedirectClient)
    with pytest.raises(SearchError):
        await fetch_page("https://example.com/redirect")

