@echo off
echo Testing getMainLoaderSimple endpoint...
curl -X POST ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"testuser\",\"hwid\":\"test-hwid\",\"fingerprint\":\"test-fingerprint\"}" ^
  https://wrongnumber.netlify.app/.netlify/functions/getMainLoaderSimple ^
  -v
