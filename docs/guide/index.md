---
description: How to read the map, the pass list, and the time strip.
---

# Guide

The home page opens on the map around a spot, the place on the ground the sky is read from, and counts the active satellites the map draws above its horizon at the time the strip shows. A pass runs from the moment a satellite rises above that horizon to the moment it sets, and a satellite rising twice in the hour makes two passes. The figures below open on each control in the order a reader meets it, from the map and the readout over it to the strip at its foot and the pass list, which stands in a column beside the map on a wide page and below it on a narrower one, and the sections after them take the same order before closing on the filters. On a phone, the page holds the map alone, with the readout and the strip in a sheet along its foot that rises to show a pressed pass and then the hour's list.

<GuideFigures>
<template #map>

Every satellite above the horizon is a dot that lays beads behind it, filled while it draws nearer the spot and open once it is past its nearest point. The map pans by drag and zooms by wheel, pinch, or its zoom buttons, and only the pass the readout holds or the list chooses draws its track across it.

</template>
<template #readout>

The readout names the spot and the time above its count of the satellites the map draws, with a tag beside the count saying whether the time follows the present, runs at {{ lapse }} times real speed, or is paused. A tally of each kind sits beneath the count, and pressing a pass anywhere turns the readout into that pass.

</template>
<template #spot>

The search at the foot of the readout finds a place or a satellite by name, and choosing a place moves the spot there while the count, the pass list, and the strip all follow it. Near me, beside the search, moves the spot to where the browser locates the reader, once the browser shares that location.

</template>
<template #strip>

The strip covers the hour from five minutes before the present, with a pin at the highest point of each pass that rises or sets inside the window. Drag along it, or use the arrow and page keys on it, to move through the window and pause the time there, and its round button runs the hour at {{ lapse }} times real speed.

</template>
<template #list>

The list holds every pass each satellite makes in the window, so one rising twice takes two rows. Each row gives the time of its highest point, its name, which way it crosses, and how high it climbs, and choosing a row moves the time to that highest point and describes the satellite above the list.

</template>
</GuideFigures>

## The Map

A craft docked to a station shares the station's dot unless the readout holds it or a search by name chooses it, when it draws a dot of its own in its kind's color and counts among the satellites the map draws.

The zoom buttons and the Minus and Plus keys step the map in or out, stopping where the chosen pass's whole crossing fits and, for a pass climbing past {{ steep }}°, where its stretch above {{ steep }}° lies beside the spot. The wheel holds the map at each of those stops before zooming on past it.

Once the map is zoomed in far enough for 5 kilometers to span 10 pixels, a dotted ring 5 kilometers out circles the chosen satellite, since its position can be kilometers off, as [Accuracy](/method/#accuracy) on the Method page sets out. The ring's dots stand twice as far apart once the satellite's orbit is more than a day old, and three times as far once it is more than {{ ageWarn }} days old.

The map draws on tiles from the hosts [Data](/data/#the-map) names. Where a host cannot be reached before any of its tiles load, the map dims under a caption naming that host, leaving the tracks, the satellites, and the spot as they stand.

## The Readout

The readout's top line gives the time in the device's own time zone, whose short name follows it. Once the time moves past midnight into the next day, the weekday stands before the time and a screen reader hears the full date.

### The Count and the Tally

Beneath the count, a tally sets one row for each kind on the map, holding the kind's mark, its name, a bar in its color whose length gives its count on one scale shared by every row, and the count itself. Beneath the tally, a line gives how many stand above the horizon in all. Pointing at a row or focusing it from the keyboard names its kind on that line with how many of the kind the map draws and how many stand above the horizon, and dims every other kind on the map and in the tally, until the pointer leaves, the focus moves, or Escape lets it go.

Pressing anywhere on a row switches its kind off, leaving it out of the map, the counts, and the pass list, and a row the keyboard has reached stays in the tally, so a second press shows the kind again. While a kind is switched off, a line at the foot of the readout names each kind left out, and pressing a name there shows that kind again.

The count and the tally hold each reading for {{ latchSeconds }} seconds, so the figures stay still while they are read, and take a new one whenever the time is dragged, stepped, or returned to the present, the spot changes, or the map is moved. While the hour runs at {{ lapse }} times real speed, they follow the satellites on the map instead. A screen reader announces how many satellites stand above the horizon at most once every {{ spokenSeconds }} seconds.

While the passes are still being traced, a line in the tally's place shows how far the scan has reached. Where the catalog was fetched longer ago than [Accuracy](/method/#accuracy) allows, the map draws no satellite at all, and the line beneath the tally gives the catalog's age instead.

### A Chosen Pass

Pointing at a pin in the strip, or pressing a satellite, a pin, or a row, turns the readout into that pass. It gives the pass's kind and the way it crosses, how far away the satellite is now and at its nearest, how high it peaks and stands now, the hours it is up, and its own sky with the compass point it stands at. A chosen pass also shows on the card above the list, with its row marked by a bar in its kind's color and its ridge in the strip filled in that color, and where the satellite stands past the edge of the map or under a panel, an arrow at the edge points toward it. Escape, the close control at the corner of the readout, or a press on the empty map lets it go.

## Choosing the Spot

Each place the search finds carries the kind of place it is, such as a city or a district, so places of one name read apart. The same search finds a satellite by name, noting beside each one when its next pass in the hour rises, that it is up now, or, where no pass is still ahead, when its last pass set. Choosing one moves the time to the highest point of the pass its note names and turns the readout into it, whereas a satellite with no pass in the hour stays listed with a note saying why but cannot be chosen. Where the browser declines to share a location, or finds none in the time Near me allows, a line under the search says so.

Pressing the place the readout names opens the spot chooser, where the map slides under a still pin, which settles onto a town within 14 pixels of it once the map stops. The Set the spot here button moves the spot to the pin and traces its passes again, and Escape, Cancel, or a press outside the chooser and the map leaves the spot as it was.

## The Time Strip

Each pin stands above the line for a northbound pass and below it for a southbound one, longer the higher it climbs. The round button, pressed again while the hour runs, returns the time to the present. Where the device asks for reduced motion, the time holds still instead, the round button moves it five minutes on, and the tag beside the count says how far the time stands from the present and returns it to the present when pressed. Once the present passes the end of the window while the time follows it, the window opens again five minutes before the present.

## The Pass List

List, among the filters, switches the list between the passes crossing the map as it is framed and those anywhere in the sky over the spot. Beside the map, the list opens on the next pass to reach its highest point, a line at its foot says when more rows wait below, and the rail between the map and the column folds the column away and opens it again.

## The Filters

Each kind of satellite takes its own color in the filters, the tally, the pass list, and the dots on the map. Each kind's mark under Show me names its kind on a tip while a pointer rests on it or the keyboard reaches it, and the heading folds the filters away and opens them again. Choosing a kind draws its satellites on the map and keeps them in the readout's counts and in the list, while a kind left out draws no dot and no track, and the page's address keeps the kinds chosen, so a reload or a shared link opens on them. The map draws at half strength every satellite whose pass stays below the height At least sets.

Only the pass the readout holds or the list chooses draws a track, and At least keeps only the passes climbing to the height chosen or above.
