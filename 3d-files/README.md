# VFD Studio enclosure

A two-piece desktop enclosure for the EPC-INBN0BV1294UD 256 × 48 VFD module. The front has a faceted bezel, an angled sensor opening and recessed markings. The back has two vent banks and comes off with four screws. The enclosure sits at a 9° backward tilt.

Assembled on a desk, it measures **177.6 mm wide × 49.4 mm deep × 69.5 mm high**.

## Print

| File | Position on the build plate |
| --- | --- |
| `01-front-shell.stl` | Display face down, with the cavity open upward. Footprint 177.6 × 70.8 mm. |
| `02-rear-cover.stl` | Outside face down, with the locating tabs pointing up. |
| `03-fit-check-optional.stl` | Display face down. This 38.8 mm-wide section includes the USB-C opening, the sensor channel and the two screw seats on that end. |

The STLs are already oriented and use millimetres. Start with PETG, a 0.4 mm nozzle, 0.2 mm layers and four walls. The side USB-C opening has an approximately 8–9 mm bridge. If your printer struggles with bridges, paint supports just under that opening and remove them before assembly.

## Assemble

1. Use the optional end section to check the adapter before printing the full shell. Try the two VFD mounting screws and confirm the light sensor lines up with its channel.
2. Slide the display in through the open back. Secure the PCB against the four seats with **four M3 × 6 mm screws**. The seats have 2.65 mm blind pilots. Tap them M3 if needed and stop tightening once the PCB is seated.
3. Plug the adapter into the USB-C connector on the right as you face the display. The opening on that end gives access to the port. For an elbow that points rearward, plug in the cable first and lay it into the notch at the rear cover's edge.
4. Fit the cover's locating tabs and use **four M3 × 8 mm button-head screws** in the recessed holes.

## Fit and CAD

- The 152 × 51 mm PCB and 146.8 × 45.8 mm M3 hole pattern come from page 18 of the module datasheet. The glass opening and ambient sensor placement were cross-checked against the prototype mount. [Module datasheet](https://cdn.hackaday.io/files/1916648200152576/EPC-INBN0BV1294UD_SPEC.pdf)
- The side opening is nominally 15.8 mm high × 17.9 mm deep before corner chamfers. The CAD check used an adapter envelope extending 11 mm past the PCB edge, with a height of 11 mm and a depth of 12.1 mm. The rear edge notch is 8.4 mm high and is intended for the cable.
- The parts and clearances were checked digitally. The fit-check STL lets you confirm your adapter, module and printer tolerances before committing to the whole shell.
- `VFD-Studio-Enclosure.step` contains the two assembled solids. To adjust the port, sensor or screw pilots, edit the settings at the top of `vfd_enclosure.py` and run it with CadQuery 2.7. The engraving uses DejaVu Sans Mono Bold.
- The preview shows the print geometry with a simulated VFD and optional paint fill in the engravings.
