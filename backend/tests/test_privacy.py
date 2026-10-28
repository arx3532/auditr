import asyncio

import pytest

from app.agent.llm.fake import FakeLLM, text_response
from app.agent.privacy import (
    Redactor,
    SensitiveDataLeak,
    ensure_no_sensitive,
    find_sensitive,
    redact_messages,
)
from tests.test_gstin import make_gstin


def test_pan_masked_in_any_case() -> None:
    assert Redactor().redact("My PAN is ABCDE1234F.") == "My PAN is [PAN_1]."
    assert Redactor().redact("pan abcde1234f") == "pan [PAN_1]"


def test_gstin_masked_whole_not_as_a_pan() -> None:
    gstin = make_gstin()
    assert Redactor().redact(f"GSTIN {gstin} ok") == "GSTIN [GSTIN_1] ok"


def test_aadhaar_spaced_and_plain_share_a_token() -> None:
    assert Redactor().redact("1234 5678 9012 and 123456789012") == "[AADHAAR_1] and [AADHAAR_1]"


def test_long_digit_runs_masked_as_numbers() -> None:
    assert Redactor().redact("account 12345678901234.") == "account [NUMBER_1]."


def test_email_masked() -> None:
    assert Redactor().redact("mail asha@example.com now") == "mail [EMAIL_1] now"


def test_same_value_same_token_different_value_new_token() -> None:
    text = "ABCDE1234F and ABCDE1234F and PQRSX9876L"
    assert Redactor().redact(text) == "[PAN_1] and [PAN_1] and [PAN_2]"


def test_restore_round_trip() -> None:
    r = Redactor()
    masked = r.redact("Pay ABCDE1234F via 12345678901234")
    assert masked == "Pay [PAN_1] via [NUMBER_1]"
    assert r.restore(masked) == "Pay ABCDE1234F via 12345678901234"
    assert r.restore("[PAN_9]") == "[PAN_9]"  # unknown tokens are left alone


@pytest.mark.parametrize(
    "text",
    [
        "Invoice INV/2026-27/0001 for ₹1,25,000.00",
        "Total 59000.00 due 2026-10-28",
        "Invoice AdTech ₹50,000 due the 15th",
        "Amount 123456789.50 received",
        "Ratio 0.123456789012",
        "id 3f2a9c1e-1111-4222-8333-123456789012",
        "id 11111111-2222-3333-4444-555555555555",
    ],
)
def test_normal_text_is_untouched(text: str) -> None:
    assert Redactor().redact(text) == text
    assert find_sensitive(text) == []


def test_fullwidth_and_zero_width_tricks_are_normalised() -> None:
    assert Redactor().redact("ＡＢＣＤＥ１２３４Ｆ") == "[PAN_1]"
    assert Redactor().redact("ABCDE\u200b1234F") == "[PAN_1]"


def test_find_sensitive_reports_kinds() -> None:
    assert find_sensitive("PAN ABCDE1234F") == ["PAN"]
    assert find_sensitive("hello") == []


def test_guard_scans_decoded_strings_inside_nested_payloads() -> None:
    payload = {"messages": [{"role": "tool", "content": "x\n12345678901234"}], "n": 1}
    with pytest.raises(SensitiveDataLeak):
        ensure_no_sensitive(payload)
    masked = {"messages": [{"role": "tool", "content": Redactor().redact("x\n12345678901234")}]}
    ensure_no_sensitive(masked)


def test_redact_messages_copies_and_masks() -> None:
    original = [
        {"role": "user", "content": "PAN ABCDE1234F"},
        {"role": "tool", "content": "acct 12345678901234"},
        {"role": "assistant", "content": None},
    ]
    masked = redact_messages(original, Redactor())
    assert masked[0] == {"role": "user", "content": "PAN [PAN_1]"}
    assert masked[1]["content"] == "acct [NUMBER_1]"
    assert masked[2] == {"role": "assistant", "content": None}
    assert original[0]["content"] == "PAN ABCDE1234F"  # input not modified


def test_fake_llm_applies_the_same_guard() -> None:
    llm = FakeLLM([text_response("ok")])
    with pytest.raises(SensitiveDataLeak):
        asyncio.run(llm.complete([{"role": "user", "content": "PAN ABCDE1234F"}]))
