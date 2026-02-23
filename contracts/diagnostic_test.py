"""
DIAGNOSTIC CONTRACT — MINIMAL VERSION
Test one thing at a time to find the exact cause of consensus failure.

STEP 1: Deploy this. Call test_write("hello") — should ACCEPT.
STEP 2: If step 1 works, move to breakup_arbitrator.py (the real contract).
"""
import json
from genlayer import *
import genlayer.gl as gl
from genlayer.gl.vm import UserError


class DiagnosticTest(gl.Contract):
    value: str
    caller_seen: str

    def __init__(self):
        self.value = "init"
        self.caller_seen = ""

    # Test 1: Bare write — no access control, no JSON
    @gl.public.write
    def test_bare_write(self, text: str):
        self.value = text

    # Test 2: Write + read sender address
    @gl.public.write
    def test_record_caller(self):
        self.caller_seen = str(gl.message.sender_address)

    # Read back what was stored
    @gl.public.view
    def get_value(self) -> str:
        return self.value

    @gl.public.view
    def get_caller_seen(self) -> str:
        return self.caller_seen
