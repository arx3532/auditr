import pytest

from app.domain.gstin import InvalidGSTIN, checksum_char, state_code, validate_gstin

KNOWN_VALID_GSTINS: list[str] = ["24AAAGM0289C1ZP", "29AAAGM0289C1ZF"]


def make_gstin(state: str = "27", pan: str = "ABCDE1234F", entity: str = "1") -> str:
    first_14 = f"{state}{pan}{entity}Z"
    return first_14 + checksum_char(first_14)


@pytest.mark.parametrize("gstin", KNOWN_VALID_GSTINS)
def test_known_real_gstins_validate(gstin: str) -> None:
    assert validate_gstin(gstin) == gstin


def test_generated_gstin_roundtrips() -> None:
    gstin = make_gstin()
    assert validate_gstin(gstin) == gstin


def test_normalises_case_and_whitespace() -> None:
    gstin = make_gstin()
    assert validate_gstin(f"  {gstin.lower()} ") == gstin


def test_state_code_extracted() -> None:
    assert state_code(make_gstin(state="29")) == "29"


def test_wrong_length_rejected() -> None:
    with pytest.raises(InvalidGSTIN):
        validate_gstin(make_gstin()[:-1])


def test_bad_format_rejected() -> None:
    with pytest.raises(InvalidGSTIN):
        validate_gstin("27ABCDE1234F1Y" + "5")  # 14th character must be Z


def test_unknown_state_rejected() -> None:
    with pytest.raises(InvalidGSTIN):
        validate_gstin(make_gstin(state="00"))


@pytest.mark.parametrize("position", range(15))
def test_changing_any_character_breaks_it(position: int) -> None:
    gstin = make_gstin()
    replacement = "0" if gstin[position] != "0" else "1"
    mutated = gstin[:position] + replacement + gstin[position + 1 :]
    with pytest.raises(InvalidGSTIN):
        validate_gstin(mutated)
