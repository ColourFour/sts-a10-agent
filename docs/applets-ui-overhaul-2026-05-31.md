# Applet UI Overhaul Notes - 2026-05-31

## Coverage

The applet selector and every registry-linked route were inspected in the local browser after the visual pass:

- XO Game Lab
- Twelve Janggi
- Nine Men's Morris
- Mini Shogi
- Amazons Mini
- Hex
- Domineering
- Konane
- Chess
- Super Hexagon
- Lights Out
- Sliding Tiles
- Towers of Hanoi
- Mastermind
- Peg Solitaire
- Sokoban Mini

## What Changed

- The applet selector is now a gallery with full-card links, visual thumbnail panels, stronger status tags, and a more substantial hero area.
- Shared page styles now give every applet clearer hierarchy, stronger control affordances, larger readable status panels, responsive spacing, and higher contrast.
- Board surfaces now have more deliberate styling for strategy boards, puzzle grids, arcade canvas, color palettes, and token-based games.
- XO Game Lab no longer stretches one-square strips into oversized cells; strips now stay compact and scroll safely when needed.
- Chess and Mini Shogi now use visual piece tokens instead of compact text-only labels.
- Mastermind, Super Hexagon, Peg Solitaire, Sokoban, and the classic grid games received clearer controls and board presentation through shared styles.

## Remaining Follow-Ups

- Nine Men's Morris still uses a CSS-drawn board line approximation. A future SVG board background would make the mill geometry more exact.
- Chess is readable and legal-move driven, but it still has no captured-piece tray, move list, or coordinate labels.
- Mini Shogi and Twelve Janggi have clearer pieces now, but a compact move history would help longer sessions.
- Super Hexagon is still a simple canvas prototype. Touch controls would make it stronger on phones.
- The selector thumbnails are CSS-native placeholders to keep the GitHub Pages build lightweight. Generated bitmap art could be added later if the project wants a more illustrated launcher.
