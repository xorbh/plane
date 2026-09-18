# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from decimal import Decimal

import pytest

from plane.db.models import IssueProperty, IssuePropertyTypeChoices
from plane.utils.issue_property import PropertyValueError, decode_wire_value, normalize_wire_values


def prop(property_type, **kwargs):
    return IssueProperty(property_type=property_type, **kwargs)


@pytest.mark.unit
class TestNormalizeWireValues:
    def test_scalars_become_lists(self):
        assert normalize_wire_values("a") == ["a"]
        assert normalize_wire_values(0) == [0]
        assert normalize_wire_values(False) == [False]

    def test_empties_are_dropped(self):
        assert normalize_wire_values(None) == []
        assert normalize_wire_values("") == []
        assert normalize_wire_values(["a", None, "", "b"]) == ["a", "b"]


@pytest.mark.unit
class TestDecodeWireValue:
    def test_text_rules(self):
        p = prop(IssuePropertyTypeChoices.TEXT, validation_rules={"max_length": 3})
        assert decode_wire_value(p, " abc ") == "abc"
        with pytest.raises(PropertyValueError):
            decode_wire_value(p, "abcd")
        with pytest.raises(PropertyValueError):
            decode_wire_value(p, 12)
        with pytest.raises(PropertyValueError):
            decode_wire_value(p, "   ")

    def test_email_and_url(self):
        assert decode_wire_value(prop(IssuePropertyTypeChoices.EMAIL), "a@b.co") == "a@b.co"
        with pytest.raises(PropertyValueError):
            decode_wire_value(prop(IssuePropertyTypeChoices.EMAIL), "nope")
        assert decode_wire_value(prop(IssuePropertyTypeChoices.URL), "https://plane.so") == "https://plane.so"
        with pytest.raises(PropertyValueError):
            decode_wire_value(prop(IssuePropertyTypeChoices.URL), "plane.so")

    def test_decimal(self):
        p = prop(IssuePropertyTypeChoices.DECIMAL, validation_rules={"min": 0, "max": 10})
        assert decode_wire_value(p, 5) == Decimal("5")
        assert decode_wire_value(p, "2.5") == Decimal("2.5")
        for bad in ("x", True, -1, 11, float("inf")):
            with pytest.raises(PropertyValueError):
                decode_wire_value(p, bad)

    def test_datetime(self):
        p = prop(IssuePropertyTypeChoices.DATETIME)
        assert decode_wire_value(p, "2026-01-15").isoformat().startswith("2026-01-15T00:00:00")
        assert decode_wire_value(p, "2026-01-15T10:30:00Z").hour == 10
        with pytest.raises(PropertyValueError):
            decode_wire_value(p, "15/01/2026")

    def test_boolean(self):
        p = prop(IssuePropertyTypeChoices.BOOLEAN)
        assert decode_wire_value(p, True) is True
        assert decode_wire_value(p, "false") is False
        with pytest.raises(PropertyValueError):
            decode_wire_value(p, 1)

    def test_option_requires_known_option(self):
        p = prop(IssuePropertyTypeChoices.OPTION)
        import uuid

        known = uuid.uuid4()
        assert decode_wire_value(p, str(known), option_ids={known}) == known
        with pytest.raises(PropertyValueError):
            decode_wire_value(p, str(uuid.uuid4()), option_ids={known})
        with pytest.raises(PropertyValueError):
            decode_wire_value(p, "not-a-uuid", option_ids={known})
