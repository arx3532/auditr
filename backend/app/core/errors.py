class DomainError(Exception):
    status_code: int = 422

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class NotFound(DomainError):
    status_code = 404


class Conflict(DomainError):
    status_code = 409


class Unprocessable(DomainError):
    status_code = 422


class ServiceUnavailable(DomainError):
    status_code = 503


class TooManyRequests(DomainError):
    status_code = 429
