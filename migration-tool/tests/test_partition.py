from migration_tool.agents.coordinator import RECOGNISED_FIELDS, partition_payload


def test_partition_payload_groups_known_fields():
    payload = {
        "establishment_name": "Hotel Test",
        "address_line1": "1 Rue du Test",
        "city": "Testville",
        "phone": "+33 123456789",
        "amenities": ["wifi", "parking"],
        "media": ["https://example.com/photo.jpg"],
        "custom_field": "value",
    }

    sections, leftovers = partition_payload(payload)

    assert sections["location"]["address_line1"] == "1 Rue du Test"
    assert sections["location"]["city"] == "Testville"
    assert sections["contact"]["phone"] == "+33 123456789"
    assert sections["amenities"]["amenities"] == ["wifi", "parking"]
    assert sections["media"]["media"] == ["https://example.com/photo.jpg"]
    assert leftovers == {"custom_field": "value"}


def test_recognised_fields_are_disjoint():
    all_fields = [field for fields in RECOGNISED_FIELDS.values() for field in fields]
    assert len(all_fields) == len(set(all_fields)), "Recognised fields should be unique"
