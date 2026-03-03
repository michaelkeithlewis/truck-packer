package com.github.skjolber.packing.visualizer.packaging;

import java.util.Comparator;

import com.github.skjolber.packing.api.BoxItem;
import com.github.skjolber.packing.api.Placement;
import com.github.skjolber.packing.api.packager.control.placement.AbstractPlacementControlsBuilder;

public class CasePlacementControlsBuilder extends AbstractPlacementControlsBuilder<Placement> {

	private final Comparator<Placement> placementComparator;
	private final Comparator<BoxItem> boxItemComparator;
	private final boolean requireFullSupport;
	private final int maxStackLevels;

	public CasePlacementControlsBuilder(Comparator<Placement> placementComparator,
			Comparator<BoxItem> boxItemComparator, boolean requireFullSupport, int maxStackLevels) {
		this.placementComparator = placementComparator;
		this.boxItemComparator = boxItemComparator;
		this.requireFullSupport = requireFullSupport;
		this.maxStackLevels = maxStackLevels;
	}

	@Override
	public CasePlacementControls build() {
		return new CasePlacementControls(
				boxItems, boxItemsStartIndex, boxItemsEndIndex,
				pointControls, pointCalculator, container, stack,
				order, placementComparator, boxItemComparator,
				requireFullSupport, maxStackLevels
		);
	}
}
