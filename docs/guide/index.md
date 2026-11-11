---
description: How to read the map, the pass list, and the time strip.
---

# Guide

The home page opens on the map around a spot, counting every active satellite above its horizon at the time the strip shows. Search a place by name or click the map to move the spot, and the count, the pass list, and the strip all follow it.

## The Readout

The readout counts the satellites above the horizon, with the spot and the time beneath the count, then how many of them stand nearly straight up and how many belong to Starlink. Once the time moves past midnight into the next day, the weekday stands before it and a screen reader hears the full date. While the passes are still being traced, its last line shows how far the scan has reached, and orbits more than three days old take that line to give their age. A screen reader announces the count at most once every 20 seconds.

## The Filters

Each kind of satellite takes its own color on the map, in the filters, and in the pass list. Choosing a kind under Trace paths for draws each of its passes across the map and adds them to the list, and Reaching at least keeps only the passes climbing to the height chosen or above. List passes switches the list between the passes crossing the map as it is framed and those anywhere in the sky over the spot.

## A Pass

A pass runs from the moment a satellite rises above the horizon to the moment it sets, and the list holds every pass each satellite makes in the window, so one rising twice takes two rows and two paths. Each row of the list gives the time of its highest point, its name, which way it crosses, and how high it climbs, and choosing a row moves the time to that highest point and describes the satellite above the list.

## The Time Strip

The strip covers the window chosen beside it, with a pin at the highest point of each listed pass that rises or sets inside the window, standing above the line for a northbound pass and below it for a southbound one, longer the higher it climbs. Drag along the strip, or use the arrow and page keys on it, to move through the window, and Play runs the sky forward at the speed chosen, with Now returning it to the present. Once the present passes the end of the window, the window moves to begin at the present.

## The Map

The map draws on tiles from the hosts [Data](/data/) names. Where a host cannot be reached before any of its tiles load, the map dims under a caption naming that host, leaving the paths, the satellites, and the spot as they stand. Once the map is zoomed in far enough for 5 kilometers to span 10 pixels, a dotted ring 5 kilometers out circles the chosen satellite, since its position can be kilometers off, as [Accuracy](/method/#accuracy) on the Method page sets out. The ring's dots stand twice as far apart once the satellite's orbit is more than a day old, and three times as far once it is more than three days old.
