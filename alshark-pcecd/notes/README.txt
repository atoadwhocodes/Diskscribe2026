# Alshark sample patch kit

This is a small custom patch kit for the partial English sample image.

## Files
- `Alshark (Japan) [EN sample].bytepatch.json` — patch data
- `apply_alshark_bytepatch.py` — patcher

## Source image expected
- `Alshark (Japan).img`
- size: 463939056 bytes
- SHA-256: `b9e9f69e0ade8af692c8edbd633486b8fca0958cfe4addd103e3bfb51d11fea8`

## Patched image produced
- `Alshark (Japan) [EN sample].img`
- SHA-256: `b220f4d608b0ac0820aa6c54aee1aa651733d317b84a79fb14b590cc75ef7c3b`

## Apply on Windows / Linux / macOS
```bash
python apply_alshark_bytepatch.py --input "Alshark (Japan).img" --patch "Alshark (Japan) [EN sample].bytepatch.json" --output "Alshark (Japan) [EN sample].img"
```

Then pair the patched IMG with renamed copies of the original CCD and SUB:
- `Alshark (Japan) [EN sample].ccd`
- `Alshark (Japan) [EN sample].sub`

Open the `.ccd` in your emulator.
