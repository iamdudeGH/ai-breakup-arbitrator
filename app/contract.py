# v0.1.0
# { "Depends": "py-genlayer:latest" }

import json
from genlayer import *
import genlayer.gl as gl
from genlayer.gl.vm import UserError


class BreakupArbitrator(gl.Contract):
    """
    An AI-powered arbitrator that fairly divides shared assets between two separating partners.
    Two registered partners submit their assets, cases, and evidence. An LLM then produces
    a binding, consensus-validated verdict on how the assets should be divided.
    """
    # ------------------------------------------------------------------ #
    #  Storage — only simple scalar types to avoid any consensus issues   #
    # ------------------------------------------------------------------ #
    partner_a: str
    partner_b: str
    status: str          # "setup" | "active" | "dispute" | "resolved"
    assets_json: str     # JSON-encoded list of asset descriptions
    case_a: str
    case_b: str
    evidence_a_json: str  # JSON-encoded list of Partner A evidence
    evidence_b_json: str  # JSON-encoded list of Partner B evidence
    resolution: str
    resolved: bool

    # ------------------------------------------------------------------ #
    #  Constructor                                                        #
    # ------------------------------------------------------------------ #
    def __init__(self, partner_a: str, partner_b: str):
        self.partner_a = partner_a.lower()
        self.partner_b = partner_b.lower()
        self.status = "setup"
        self.assets_json = "[]"
        self.case_a = ""
        self.case_b = ""
        self.evidence_a_json = "[]"
        self.evidence_b_json = "[]"
        self.resolution = ""
        self.resolved = False

    # ------------------------------------------------------------------ #
    #  Private helpers                                                    #
    # ------------------------------------------------------------------ #
    def _caller(self) -> str:
        return str(gl.message.sender_address).lower()

    def _require_partner(self):
        caller = self._caller()
        if caller != self.partner_a and caller != self.partner_b:
            raise UserError("Only registered partners can call this method")

    def _require_status(self, expected: str):
        if self.status != expected:
            raise UserError(f"Expected status '{expected}', current: '{self.status}'")

    def _is_partner_a(self) -> bool:
        return self._caller() == self.partner_a

    # ------------------------------------------------------------------ #
    #  Write methods                                                      #
    # ------------------------------------------------------------------ #
    @gl.public.write
    def add_asset(self, description: str):
        """Add a shared asset during the setup phase."""
        self._require_partner()
        self._require_status("setup")
        desc = description.strip()
        if not desc:
            raise UserError("Asset description cannot be empty")
        assets = json.loads(self.assets_json)
        assets.append(desc)
        self.assets_json = json.dumps(assets)

    @gl.public.write
    def activate(self):
        """Lock assets and open the contract for case submissions."""
        self._require_partner()
        self._require_status("setup")
        assets = json.loads(self.assets_json)
        if len(assets) == 0:
            raise UserError("Add at least one shared asset before activating")
        self.status = "active"

    @gl.public.write
    def submit_case(self, statement: str):
        """Submit your side of the story (max one submission per partner)."""
        self._require_partner()
        if self.status not in ("active", "dispute"):
            raise UserError("Contract must be 'active' or 'dispute' to submit a case")
        stmt = statement.strip()
        if not stmt:
            raise UserError("Statement cannot be empty")
        if self._is_partner_a():
            if self.case_a:
                raise UserError("Partner A has already submitted a case")
            self.case_a = stmt
        else:
            if self.case_b:
                raise UserError("Partner B has already submitted a case")
            self.case_b = stmt
        if self.case_a and self.case_b:
            self.status = "dispute"

    @gl.public.write
    def submit_evidence(self, evidence: str):
        """Submit a piece of evidence (text, URL, quote, etc.)."""
        self._require_partner()
        if self.status not in ("active", "dispute"):
            raise UserError("Contract must be 'active' or 'dispute' to submit evidence")
        ev = evidence.strip()
        if not ev:
            raise UserError("Evidence cannot be empty")
        if self._is_partner_a():
            items = json.loads(self.evidence_a_json)
            items.append(ev)
            self.evidence_a_json = json.dumps(items)
        else:
            items = json.loads(self.evidence_b_json)
            items.append(ev)
            self.evidence_b_json = json.dumps(items)

    @gl.public.write
    def request_resolution(self):
        """Trigger AI arbitration. Both cases must be submitted first."""
        self._require_partner()
        self._require_status("dispute")
        if not self.case_a or not self.case_b:
            raise UserError("Both partners must submit their case first")

        assets = json.loads(self.assets_json)
        evidence_a = json.loads(self.evidence_a_json)
        evidence_b = json.loads(self.evidence_b_json)

        asset_list = "\n".join(f"  {i+1}. {a}" for i, a in enumerate(assets))

        ev_a_text = (
            "\n".join(f"  - {e}" for e in evidence_a)
            if evidence_a else "  (no evidence submitted)"
        )
        ev_b_text = (
            "\n".join(f"  - {e}" for e in evidence_b)
            if evidence_b else "  (no evidence submitted)"
        )

        prompt_input = f"""You are a fair and impartial relationship breakup arbitrator.

SHARED ASSETS TO DIVIDE:
{asset_list}

PARTNER A'S STATEMENT:
"{self.case_a}"

PARTNER A'S EVIDENCE:
{ev_a_text}

PARTNER B'S STATEMENT:
"{self.case_b}"

PARTNER B'S EVIDENCE:
{ev_b_text}
"""

        task = (
            "Analyze both partners' statements and evidence, then produce a "
            "fair asset division ruling. For EACH asset, decide who gets it "
            "(Partner A, Partner B, or split with percentages) and give a "
            "brief justification. Format: list each asset with 'Awarded to:' "
            "and 'Reason:', then end with a 2-3 sentence SUMMARY."
        )

        criteria = (
            "Every asset must be addressed. Base decisions only on the "
            "provided statements and evidence. Be impartial. A neutral "
            "mediator should be able to agree with the ruling."
        )

        def _get_input():
            return prompt_input

        ruling = gl.eq_principle.prompt_non_comparative(
            _get_input,
            task=task,
            criteria=criteria,
        )

        self.resolution = ruling
        self.resolved = True
        self.status = "resolved"

    # ------------------------------------------------------------------ #
    #  View methods                                                       #
    # ------------------------------------------------------------------ #
    @gl.public.view
    def get_status(self) -> str:
        return self.status

    @gl.public.view
    def get_assets(self) -> list:
        return json.loads(self.assets_json)

    @gl.public.view
    def get_resolution(self) -> str:
        if not self.resolved:
            raise UserError("Resolution has not been issued yet")
        return self.resolution

    @gl.public.view
    def get_case_summary(self) -> str:
        assets = json.loads(self.assets_json)
        ev_a = json.loads(self.evidence_a_json)
        ev_b = json.loads(self.evidence_b_json)
        return (
            f"Status: {self.status}\n"
            f"Assets: {', '.join(assets) or '(none)'}\n"
            f"Partner A case: {self.case_a or '(not submitted)'}\n"
            f"Partner A evidence: {'; '.join(ev_a) or '(none)'}\n"
            f"Partner B case: {self.case_b or '(not submitted)'}\n"
            f"Partner B evidence: {'; '.join(ev_b) or '(none)'}\n"
            f"Resolved: {self.resolved}"
        )

    @gl.public.view
    def get_partners(self) -> list:
        return [self.partner_a, self.partner_b]
