package com.github.skjolber.packing.visualizer.packaging;

import java.util.Comparator;

import com.github.skjolber.packing.api.BoxItem;
import com.github.skjolber.packing.api.Placement;
import com.github.skjolber.packing.api.packager.control.placement.PlacementControlsBuilderFactory;

public class CasePlacementControlsBuilderFactory implements PlacementControlsBuilderFactory<Placement> {

	/**
	 * Never prune any box item so the PlacementComparator is the sole
	 * decision-maker. The library skips a box when
	 * {@code compare(currentBest, candidate) >= 0}, so returning -1
	 * ensures every candidate is evaluated.
	 */
	private static final Comparator<BoxItem> NO_PRUNE = (a, b) -> -1;

	private final boolean preferSameType;
	private final boolean requireFullSupport;
	private final boolean groupByCategory;
	private final int maxStackLevels;

	public CasePlacementControlsBuilderFactory(boolean preferSameType, boolean requireFullSupport,
			boolean groupByCategory, int maxStackLevels) {
		this.preferSameType = preferSameType;
		this.requireFullSupport = requireFullSupport;
		this.groupByCategory = groupByCategory;
		this.maxStackLevels = maxStackLevels;
	}

	public CasePlacementControlsBuilderFactory() {
		this(true, true, false, 0);
	}

	@Override
	public CasePlacementControlsBuilder createPlacementControlsBuilder() {
		return new CasePlacementControlsBuilder(
				new CasePlacementComparator(preferSameType, groupByCategory),
				NO_PRUNE,
				requireFullSupport,
				maxStackLevels
		);
	}
}
