---
description: How to read the map, the pass list, and the time strip.
---

<script setup lang="ts">
import { AGES } from '../.vitepress/lib/orbit/catalog.ts'
</script>

# Guide

The home page opens on the map around a spot, counting the active satellites above its horizon that the map frames at the time the strip shows. Search a place by name or click the map to move the spot, and the count, the pass list, and the strip all follow it.

## The Readout

The readout names the spot and the time above its count of the satellites the map draws, with a tag beside the count saying whether the time follows the present, runs at 60 times real speed, or is paused. Beneath the count, a tally sets one tick per satellite on the map in its kind's color, grouped by kind, and its last line gives how many stand above the horizon in all. Pointing at a group, focusing it from the keyboard, or tapping it names its kind on that line with how many of the kind stand above the horizon, and dims every other kind on the map and in the tally until the pointer leaves, the focus moves, or a second tap or Escape lets it go. The count and the tally hold each reading for 30 seconds, so the figures stay still while they are read, and take a new one whenever the time moves, the spot changes, or the map is moved. Once the time moves past midnight into the next day, the weekday stands before it and a screen reader hears the full date. While the passes are still being traced, its last line shows how far the scan has reached, and a catalog fetched more than {{ AGES.warn }} days earlier takes that line to give its age, while one more than {{ AGES.limit }} days old draws no satellite at all. A screen reader announces the count at most once every 20 seconds.

## The Filters

Each kind of satellite takes its own color on the map, in the filters, and in the pass list. Choosing a kind under Trace paths for draws each of its passes across the map and adds them to the list, and Reaching at least keeps only the passes climbing to the height chosen or above. List passes switches the list between the passes crossing the map as it is framed and those anywhere in the sky over the spot.

## A Pass

A pass runs from the moment a satellite rises above the horizon to the moment it sets, and the list holds every pass each satellite makes in the window, so one rising twice takes two rows and two paths. Each row of the list gives the time of its highest point, its name, which way it crosses, and how high it climbs, and choosing a row moves the time to that highest point and describes the satellite above the list.

## The Time Strip

The strip covers the hour from five minutes before the present, with a pin at the highest point of each listed pass that rises or sets inside the window, standing above the line for a northbound pass and below it for a southbound one, longer the higher it climbs. Drag along the strip, or use the arrow and page keys on it, to move through the window and pause the time there. The round button beside the strip runs the rest of the hour at 60 times real speed and, pressed again, returns the time to the present. Where the device asks for reduced motion, the time holds still instead, the round button moves it five minutes on, and the tag beside the count says how far the time stands from the present and returns it to the present when pressed. Once the present passes the end of the window while the time follows it, the window opens again five minutes before the present.

## The Map

The map draws on tiles from the hosts [Data](/data/) names. Where a host cannot be reached before any of its tiles load, the map dims under a caption naming that host, leaving the paths, the satellites, and the spot as they stand. Once the map is zoomed in far enough for 5 kilometers to span 10 pixels, a dotted ring 5 kilometers out circles the chosen satellite, since its position can be kilometers off, as [Accuracy](/method/#accuracy) on the Method page sets out. The ring's dots stand twice as far apart once the satellite's orbit is more than a day old, and three times as far once it is more than {{ AGES.warn }} days old.
