class SearchError(ValueError):
    """Raised when a search provider or page fetch fails."""


class ProviderNotFoundError(SearchError):
    """Raised when the configured search provider is unknown."""
