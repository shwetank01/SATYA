import json
import os
import sys

import pytest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.abspath(os.path.join(HERE, "..")))
SPEC = os.path.abspath(os.path.join(HERE, "..", "..", "spec"))

from masker import mask  # noqa: E402

VECTORS = json.load(open(os.path.join(SPEC, "mask_vectors.json"), encoding="utf-8"))["vectors"]


@pytest.mark.parametrize("v", VECTORS, ids=[v["in"][:40] for v in VECTORS])
def test_mask_vectors(v):
    assert mask(v["in"], v["my_names"], v["my_phones"]) == v["out"]


def test_mask_matches_oracle_on_extra_text():
    sys.path.insert(0, os.path.join(SPEC, "reference"))
    import mask_ref  # noqa: E402

    samples = [
        "Main HDFC Bank se bol raha hoon, jo OTP 482913 aaya hai woh bata dijiye. Call 9876501234",
        "Pay ₹10 KYC fee to sbi.kyc@ybl or visit sbi-kyc-update.in/verify?id=9, PAN ABCDE1234F",
        "Transfer 4.8 lakh to a/c 50100123456780 IFSC HDFC0001234 urgently",
    ]
    for s in samples:
        assert mask(s, ["Ravi"], ["9876543210"]) == mask_ref.mask(s, ["Ravi"], ["9876543210"])
