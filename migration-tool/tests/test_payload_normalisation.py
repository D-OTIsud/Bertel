"""Tests covering normalisation of legacy payload envelopes."""

from __future__ import annotations

import pytest

import pytest

from migration_tool.schemas import RawEstablishmentPayload


def _sample_payload() -> list[dict[str, object]]:
    return [
        {
            "dataProvidingOrg": "ORGRUN000001",
            "data": [
                {
                    "Nom_OTI": "Le Relais Commerson",
                    "Groupe catégorie": "Restauration",
                    "Nom catégorie": "Restaurant",
                    "Nom sous catégorie": "Restaurant",
                    "Numéro": "37",
                    "rue": "rue Boisjoly Potier",
                    "Code Postal": 97418,
                    "ville": "Le Tampon",
                    "Localisations": "Village,Milieu rural",
                    "Coordonnées GPS": "-21.204197, 55.577417",
                    "E-Mail": "info@example.com",
                    "Contact principale": "0262275287",
                    "Autre téléphone": "0692600544",
                    "Web": "https://example.com",
                    "Prestations sur place": "parking, wifi",
                    "Mode de paiement": "Carte Bancaire,Espèces",
                    "Langues": "français,anglais",
                    "Descriptif OTI": "Description",
                    "Accroche OTI": "Summary",
                    "Status": "Ouvert",
                    "Handicap": True,
                    "Animaux": False,
                    "id OTI": "ABC123",
                },
                {
                    "data": [
                        {
                            "Presta ID": "P001",
                            "Nom": "Adenor",
                            "Prénom": "Jean-Luc",
                            "Email": "jean@example.com",
                        }
                    ]
                },
                {
                    "data": [
                        {
                            "Horaires_id": "H001",
                            "jours": "Lundi , Mardi",
                            "AM_Start": "09:00",
                            "AM_Finish": "17:00",
                        }
                    ]
                },
                {
                    "data": [
                        {
                            "id_multimedia": "M001",
                            "lien": "https://example.com/photo.jpg",
                            "type": "image/jpeg",
                            "description": "Exterior",
                            "principale": True,
                        }
                    ]
                },
                {
                    "data": [
                        {
                            "Type_R_S": "facebook",
                            "URL": "https://facebook.com/relais",
                        }
                    ]
                },
            ],
        }
    ]


def test_raw_payload_is_normalised() -> None:
    payload = RawEstablishmentPayload.model_validate(_sample_payload())

    assert payload.establishment_name == "Le Relais Commerson"
    assert payload.establishment_category == "Restaurant"
    assert payload.establishment_subcategory == "Restaurant"
    assert payload.source_organization_id == "ORGRUN000001"
    assert "ABC123" in payload.legacy_ids

    data = payload.data
    assert data["address_line1"].startswith("37")
    assert data["city"] == "Le Tampon"
    assert pytest.approx(data["latitude"], rel=1e-3) == -21.204
    assert "parking" in data["amenities"]
    assert any("village" in tag.lower() for tag in data["environment_tags"])
    assert any("carte" in method.lower() for method in data["payment_methods"])
    assert any(lang.lower().startswith("fr") for lang in data["languages"])
    assert data["pets_allowed"] is False
    assert any(media_item["url"].startswith("https://example.com") for media_item in data["media"])
    assert data["providers"][0]["Presta ID"] == "P001"
    assert data["schedule"][0]["Horaires_id"] == "H001"
    assert data["socials"][0]["network"] == "facebook"


def test_payload_from_json_string() -> None:
    json_payload = """
    [
      {
        "name": "Le Relais Commerson",
        "category": "Restaurant",
        "subcategory": "Restaurant",
        "dataProvidingOrg": "ORGRUN000001",
        "data": {
          "address_line1": "37 rue Boisjoly Potier",
          "city": "Le Tampon",
          "latitude": -21.204197,
          "longitude": 55.577417
        }
      }
    ]
    """

    payload = RawEstablishmentPayload.model_validate(json_payload)

    assert payload.establishment_name == "Le Relais Commerson"
    assert payload.establishment_category == "Restaurant"
    assert payload.data["city"] == "Le Tampon"


def test_payload_from_xml_string() -> None:
    xml_payload = """
    <establishment>
        <name>Le Relais Commerson</name>
        <category>Restaurant</category>
        <subcategory>Restaurant</subcategory>
        <dataProvidingOrg>ORGRUN000001</dataProvidingOrg>
        <data>
            <address_line1>37 rue Boisjoly Potier</address_line1>
            <city>Le Tampon</city>
            <latitude>-21.204197</latitude>
            <longitude>55.577417</longitude>
        </data>
    </establishment>
    """

    payload = RawEstablishmentPayload.model_validate(xml_payload)

    assert payload.establishment_name == "Le Relais Commerson"
    assert payload.establishment_category == "Restaurant"
    assert pytest.approx(-21.204197, rel=1e-3) == payload.data["latitude"]
    assert payload.data["raw_xml_tag"] == "establishment"


def test_payload_from_plain_text() -> None:
    text_payload = """
    Nom_OTI: Le Relais Commerson
    Groupe catégorie: Restauration
    Nom catégorie: Restaurant
    Nom sous catégorie: Restaurant
    dataProvidingOrg: ORGRUN000001
    Numéro: 37
    rue: rue Boisjoly Potier
    ville: Le Tampon
    Coordonnées GPS: -21.204197, 55.577417
    E-Mail: info@example.com
    Contact principale: 0262275287
    """

    payload = RawEstablishmentPayload.model_validate(text_payload)

    assert payload.establishment_name == "Le Relais Commerson"
    assert payload.establishment_category in {"Restauration", "Restaurant"}
    assert payload.data["city"] == "Le Tampon"
    phone_field = payload.data["phone"]
    if isinstance(phone_field, list):
        assert "0262275287" in phone_field
    else:
        assert "0262275287" in str(phone_field)
