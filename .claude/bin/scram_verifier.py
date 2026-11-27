#!/usr/bin/env python3
"""Read a password on stdin, print its PostgreSQL SCRAM-SHA-256 verifier.

Format (RFC 5802 / 7677, as stored in pg_authid):
  SCRAM-SHA-256$<iterations>:<salt>$<StoredKey>:<ServerKey>
Postgres accepts this in ALTER ROLE ... PASSWORD '...' and stores it as-is,
so the plaintext never reaches the server.
"""
import base64
import hashlib
import hmac
import os
import sys

ITERATIONS = 4096
pw = sys.stdin.read().encode("utf-8")
if not pw:
    sys.exit("empty password")
salt = os.urandom(16)
salted = hashlib.pbkdf2_hmac("sha256", pw, salt, ITERATIONS)
client_key = hmac.new(salted, b"Client Key", hashlib.sha256).digest()
stored_key = hashlib.sha256(client_key).digest()
server_key = hmac.new(salted, b"Server Key", hashlib.sha256).digest()
b64 = lambda b: base64.b64encode(b).decode()
print(f"SCRAM-SHA-256${ITERATIONS}:{b64(salt)}${b64(stored_key)}:{b64(server_key)}")
