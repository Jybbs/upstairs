---
description: How to read the map, the pass list, and the time strip.
---

<script setup lang="ts">
import { AGES } from '../.vitepress/lib/orbit/catalog.ts'
</script>

# Guide

The home page opens on the map around a spot, counting the active satellites above its horizon that the map frames at the time the strip shows. Search a place by name or press the place the readout names to move the spot, and the count, the pass list, and the strip all follow it. The same search finds a satellite by name, moving the time to the highest point of its highest pass in the hour and turning the readout into that pass. Below the map, the pass list and the filters follow once the page scrolls. On a phone, the page holds the map alone, with the readout and the strip in a sheet along its foot that rises to show a pressed pass and then the hour's list.

## The Readout

The readout names the spot and the time above its count of the satellites the map draws, with a tag beside the count saying whether the time follows the present, runs at 60 times real speed, or is paused. Beneath the count, a tally sets one tick per satellite on the map in its kind's color, grouped by kind, and its last line gives how many stand above the horizon in all. Pointing at a group, focusing it from the keyboard, or tapping it names its kind on that line with how many of the kind the map draws and how many stand above the horizon, and dims every other kind on the map and in the tally until the pointer leaves, the focus moves, or a second tap or Escape lets it go. The count and the tally hold each reading for 30 seconds, so the figures stay still while they are read, and take a new one whenever the time is dragged, stepped, or returned to the present, the spot changes, or the map is moved. While the hour runs at 60 times real speed, they follow the satellites on the map instead. Once the time moves past midnight into the next day, the weekday stands before it and a screen reader hears the full date. While the passes are still being traced, its last line shows how far the scan has reached, and a catalog fetched more than {{ AGES.limit }} days earlier draws no satellite at all and takes that line to give its age. A screen reader announces how many satellites stand above the horizon at most once every 20 seconds.

Pointing at a pin in the strip, or pressing a satellite, a pin, or a row, turns the readout into that pass, giving its kind and the way it crosses, how far away it is now and at its nearest, how high it peaks and stands now, the hours it is up, and its own sky with the compass point it stands at. Escape or a press on the empty map lets it go.

## Choosing the Spot

Pressing the place the readout names opens the spot chooser, where the map slides under a still pin, which settles onto a town within 14 pixels of it once the map stops. The Set the spot here button moves the spot to the pin and traces its passes again, and Escape, Cancel, or a press outside the chooser and the map leaves the spot as it was.

## The Filters

Each kind of satellite takes its own color in the filters, the tally, and the pass list, and on the map for the pass the readout holds or the list chooses, every other satellite drawing in one tone. Choosing a kind under Show passes of keeps its passes in the list, and the map draws at half strength every other satellite whose kind is left out or whose pass stays below the height Reaching at least sets. Only the pass the readout holds or the list chooses draws a track, whichever kinds the filters show, and Reaching at least keeps only the passes climbing to the height chosen or above. List passes switches the list between the passes crossing the map as it is framed and those anywhere in the sky over the spot.

## A Pass

A pass runs from the moment a satellite rises above the horizon to the moment it sets, and the list holds every pass each satellite makes in the window, so one rising twice takes two rows. Each row of the list gives the time of its highest point, its name, which way it crosses, and how high it climbs, and choosing a row moves the time to that highest point and describes the satellite above the list.

## The Time Strip

The strip covers the hour from five minutes before the present, with a pin at the highest point of each listed pass that rises or sets inside the window, standing above the line for a northbound pass and below it for a southbound one, longer the higher it climbs. Drag along the strip, or use the arrow and page keys on it, to move through the window and pause the time there. The round button beside the strip runs the rest of the hour at 60 times real speed and, pressed again, returns the time to the present. Where the device asks for reduced motion, the time holds still instead, the round button moves it five minutes on, and the tag beside the count says how far the time stands from the present and returns it to the present when pressed. Once the present passes the end of the window while the time follows it, the window opens again five minutes before the present.

## The Map

Every satellite above the horizon is a dot that lays beads behind it, filled while it draws nearer the spot and open once it is past its nearest point, and a craft docked to a station shares the station's dot. The zoom buttons and the Minus and Plus keys step the map in or out, stopping where the chosen pass's whole crossing fits and, for a pass climbing past 30°, where its stretch above 30° lies beside the spot, and the wheel holds the map at each of those stops before zooming on past it. The map draws on tiles from the hosts [Data](/data/) names. Where a host cannot be reached before any of its tiles load, the map dims under a caption naming that host, leaving the paths, the satellites, and the spot as they stand. Once the map is zoomed in far enough for 5 kilometers to span 10 pixels, a dotted ring 5 kilometers out circles the chosen satellite, since its position can be kilometers off, as [Accuracy](/method/#accuracy) on the Method page sets out. The ring's dots stand twice as far apart once the satellite's orbit is more than a day old, and three times as far once it is more than {{ AGES.warn }} days old.
