package com.github.skjolber.packing.visualizer.packaging;

import java.util.Comparator;

import com.github.skjolber.packing.api.Placement;

/**
 * Section-based placement comparator for realistic truck loading.
 *
 * Packs in "walls" from back of truck to front, filling each
 * section floor-to-ceiling before moving on:
 *
 *   1. Lower X -- stay in the current wall/section
 *   2. Category adjacency (optional) -- cluster same-category cases
 *   3. Same-type stacking (optional) -- stack matching types
 *   4. Lower Z -- fill from floor upward within the section
 *   5. Lower Y -- fill left to right across the truck width
 *   6. Larger footprint as final tiebreaker
 *
 * Convention: compare(a, b) > 0 means a is preferred.
 */
public class CasePlacementComparator implements Comparator<Placement> {

	private final boolean preferSameType;
	private final boolean groupByCategory;

	public CasePlacementComparator(boolean preferSameType, boolean groupByCategory) {
		this.preferSameType = preferSameType;
		this.groupByCategory = groupByCategory;
	}

	public CasePlacementComparator() {
		this(true, false);
	}

	@Override
	public int compare(Placement a, Placement b) {
		// 1. Lower X -- fill current wall/section before moving forward
		int xCmp = Integer.compare(b.getPoint().getMinX(), a.getPoint().getMinX());
		if (xCmp != 0) return xCmp;

		if (a instanceof CasePlacement ca && b instanceof CasePlacement cb) {
			// 2. Category adjacency -- cluster same-category cases
			if (groupByCategory) {
				boolean aNear = ca.isNearSameCategory();
				boolean bNear = cb.isNearSameCategory();
				if (aNear != bNear) {
					return aNear ? 1 : -1;
				}
			}

			// 3. Same-type stacking -- stack matching case types
			if (preferSameType && a.getPoint().getMinZ() > 0) {
				boolean aOnSame = ca.getSameTypeSupportArea() > 0;
				boolean bOnSame = cb.getSameTypeSupportArea() > 0;

				if (aOnSame != bOnSame) {
					return aOnSame ? 1 : -1;
				}

				if (aOnSame) {
					int pctCmp = Long.compare(ca.getSameTypeSupportPercent(), cb.getSameTypeSupportPercent());
					if (pctCmp != 0) return pctCmp;
				}
			}
		}

		// 4. Lower Z -- fill from floor upward within the section
		int zCmp = Integer.compare(b.getPoint().getMinZ(), a.getPoint().getMinZ());
		if (zCmp != 0) return zCmp;

		// 5. Lower Y -- fill left to right across the width
		int yCmp = Integer.compare(b.getPoint().getMinY(), a.getPoint().getMinY());
		if (yCmp != 0) return yCmp;

		// 6. Larger footprint tiebreaker
		return Long.compare(a.getStackValue().getArea(), b.getStackValue().getArea());
	}
}
