from __future__ import annotations


def test_package_import_sanity() -> None:
    import sts2_agent

    assert sts2_agent.__version__ == "0.1.0"

