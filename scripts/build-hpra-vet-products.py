#!/usr/bin/env python3
"""Builds src/lib/medicines/hpra-vet-products.json from the HPRA animal XML list.

Usage: python3 scripts/build-hpra-vet-products.py latestAnimallist.xml
Source: https://www.hpra.ie/find-a-medicine/for-animal-use/xml-product-list
"""
import json
import sys
import xml.etree.ElementTree as ET

NS = {"h": "https://assets.hpra.ie/products//xml/Animal"}


def text(el, path):
    found = el.find(path, NS)
    return (found.text or "").strip() if found is not None and found.text else ""


def many(el, path):
    return [(x.text or "").strip() for x in el.findall(path, NS) if x.text and x.text.strip()]


def main(src, out="src/lib/medicines/hpra-vet-products.json"):
    root = ET.parse(src).getroot()
    rows = []
    for p in root.findall("h:Product", NS):
        licence = text(p, "h:LicenceNumber") or text(p, "h:DrugIDPK")
        name = text(p, "h:ProductName").rstrip(".")
        if not licence or not name:
            continue
        rows.append([
            licence,
            name,
            text(p, "h:PAHolder"),
            text(p, "h:VetLegalStatus"),
            "|".join(many(p, "h:VetSpecies/h:Species")),
            text(p, "h:DosageForm"),
            "|".join(many(p, "h:ActiveSubstances/h:ActiveSubstance")),
            text(p, "h:RegistrationStatus"),
        ])
    rows.sort(key=lambda r: r[1].lower())
    payload = {
        "publishedAt": root.get("datePublished", ""),
        "source": "https://www.hpra.ie/find-a-medicine/for-animal-use/xml-product-list",
        "products": rows,
    }
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(rows)} products, published {payload['publishedAt']} -> {out}")


if __name__ == "__main__":
    main(*sys.argv[1:])
