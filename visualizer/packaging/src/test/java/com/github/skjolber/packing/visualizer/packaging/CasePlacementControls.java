package com.github.skjolber.packing.visualizer.packaging;

import java.util.Comparator;
import java.util.List;

import com.github.skjolber.packing.api.Box;
import com.github.skjolber.packing.api.BoxItem;
import com.github.skjolber.packing.api.BoxStackValue;
import com.github.skjolber.packing.api.Container;
import com.github.skjolber.packing.api.Order;
import com.github.skjolber.packing.api.Placement;
import com.github.skjolber.packing.api.Stack;
import com.github.skjolber.packing.api.packager.BoxItemSource;
import com.github.skjolber.packing.api.packager.control.point.PointControls;
import com.github.skjolber.packing.api.point.Point;
import com.github.skjolber.packing.api.point.PointCalculator;
import com.github.skjolber.packing.packer.plain.PlainPlacementControls;

public class CasePlacementControls extends PlainPlacementControls {

	public static final String CASE_TYPE_PROPERTY = "caseType";
	public static final String CATEGORY_PROPERTY = "category";
	public static final String CAN_BE_STACKED_PROPERTY = "canBeStacked";
	public static final String CAN_HAVE_ON_TOP_PROPERTY = "canHaveOnTop";

	private final int maxStackLevels;

	public CasePlacementControls(BoxItemSource boxItems, int boxItemsStartIndex, int boxItemsEndIndex,
			PointControls pointControls, PointCalculator pointCalculator, Container container, Stack stack,
			Order order, Comparator<Placement> placementComparator,
			Comparator<BoxItem> boxItemComparator, boolean requireFullSupport, int maxStackLevels) {
		super(boxItems, boxItemsStartIndex, boxItemsEndIndex, pointControls, pointCalculator, container, stack,
				order, placementComparator, boxItemComparator, requireFullSupport);
		this.maxStackLevels = maxStackLevels;
	}

	@Override
	protected CasePlacement createPlacement(Point point, BoxStackValue stackValue) {
		long support = calculateAreaSupport(pointCalculator, point, stackValue);

		// Gravity: never allow a box to float with zero support
		if (point.getMinZ() > 0 && support == 0) {
			return null;
		}

		if (requireFullSupport && !fitsWithinSingleSupporter(point, stackValue)) {
			return null;
		}

		if (maxStackLevels > 0 && countStackLevel(point) > maxStackLevels) {
			return null;
		}

		if (point.getMinZ() > 0) {
			if ("false".equalsIgnoreCase(getProperty(stackValue.getBox(), CAN_BE_STACKED_PROPERTY))) {
				return null;
			}
			if (supporterForbidsTop(point, stackValue)) {
				return null;
			}
		}

		long sameTypeSupport = calculateSameTypeSupport(pointCalculator, point, stackValue);
		boolean nearCategory = isNearSameCategory(point, stackValue);
		return new CasePlacement(stackValue, point, support, sameTypeSupport, nearCategory);
	}

	private boolean supporterForbidsTop(Point point, BoxStackValue stackValue) {
		int minX = point.getMinX();
		int minY = point.getMinY();
		int maxX = minX + stackValue.getDx() - 1;
		int maxY = minY + stackValue.getDy() - 1;
		int z = point.getMinZ() - 1;

		for (Placement below : pointCalculator.getPlacements()) {
			if (below.getAbsoluteEndZ() != z) continue;
			if (below.getAbsoluteX() > maxX || below.getAbsoluteEndX() < minX) continue;
			if (below.getAbsoluteY() > maxY || below.getAbsoluteEndY() < minY) continue;

			if ("false".equalsIgnoreCase(getProperty(below.getBox(), CAN_HAVE_ON_TOP_PROPERTY))) {
				return true;
			}
		}
		return false;
	}

	static String getProperty(Box box, String key) {
		if (box == null) return null;
		return box.getProperty(key);
	}

	private int countStackLevel(Point point) {
		if (point.getMinZ() == 0) return 1;

		int level = 1;
		int z = point.getMinZ();
		int px = point.getMinX();
		int py = point.getMinY();

		List<Placement> placements = pointCalculator.getPlacements();
		while (z > 0) {
			level++;
			boolean found = false;
			for (Placement below : placements) {
				if (below.getAbsoluteEndZ() != z - 1) continue;
				if (below.getAbsoluteX() <= px && below.getAbsoluteEndX() >= px
						&& below.getAbsoluteY() <= py && below.getAbsoluteEndY() >= py) {
					z = below.getAbsoluteZ();
					found = true;
					break;
				}
			}
			if (!found) break;
		}
		return level;
	}

	private boolean fitsWithinSingleSupporter(Point point, BoxStackValue stackValue) {
		if (point.getMinZ() == 0) return true;

		int minX = point.getMinX();
		int minY = point.getMinY();
		int maxX = minX + stackValue.getDx() - 1;
		int maxY = minY + stackValue.getDy() - 1;
		int z = point.getMinZ() - 1;

		List<Placement> placements = pointCalculator.getPlacements();
		for (Placement below : placements) {
			if (below.getAbsoluteEndZ() != z) continue;

			if (below.getAbsoluteX() <= minX && below.getAbsoluteEndX() >= maxX
					&& below.getAbsoluteY() <= minY && below.getAbsoluteEndY() >= maxY) {
				return true;
			}
		}
		return false;
	}

	private boolean isNearSameCategory(Point point, BoxStackValue stackValue) {
		String category = getCategory(stackValue.getBox());
		if (category == null) return false;

		int minX = point.getMinX();
		int minY = point.getMinY();
		int maxX = minX + stackValue.getDx() - 1;
		int maxY = minY + stackValue.getDy() - 1;

		List<Placement> placements = pointCalculator.getPlacements();
		for (Placement placed : placements) {
			String placedCat = getCategory(placed.getBox());
			if (!category.equals(placedCat)) continue;

			if (placed.getAbsoluteEndX() + 1 >= minX && placed.getAbsoluteX() - 1 <= maxX
					&& placed.getAbsoluteEndY() + 1 >= minY && placed.getAbsoluteY() - 1 <= maxY) {
				return true;
			}
		}
		return false;
	}

	static String getCategory(Box box) {
		if (box == null) return null;
		return box.getProperty(CATEGORY_PROPERTY);
	}

	static long calculateSameTypeSupport(PointCalculator pointCalculator, Point referencePoint, BoxStackValue stackValue) {
		if (referencePoint.getMinZ() == 0) {
			return stackValue.getArea();
		}

		String caseType = getCaseType(stackValue.getBox());
		if (caseType == null) {
			return 0;
		}

		long sum = 0;

		int minX = referencePoint.getMinX();
		int minY = referencePoint.getMinY();
		int maxX = minX + stackValue.getDx() - 1;
		int maxY = minY + stackValue.getDy() - 1;

		int z = referencePoint.getMinZ() - 1;

		List<Placement> placements = pointCalculator.getPlacements();
		for (Placement below : placements) {
			if (below.getAbsoluteEndZ() != z) continue;

			String belowType = getCaseType(below.getBox());
			if (!caseType.equals(belowType)) continue;

			if (below.getAbsoluteX() > maxX) continue;
			if (below.getAbsoluteY() > maxY) continue;
			if (below.getAbsoluteEndX() < minX) continue;
			if (below.getAbsoluteEndY() < minY) continue;

			int x1 = Math.max(below.getAbsoluteX(), minX);
			int y1 = Math.max(below.getAbsoluteY(), minY);
			int x2 = Math.min(below.getAbsoluteEndX(), maxX);
			int y2 = Math.min(below.getAbsoluteEndY(), maxY);

			sum += (long)(x2 - x1 + 1) * (y2 - y1 + 1);
		}

		return sum;
	}

	static String getCaseType(Box box) {
		if (box == null) return null;
		return box.getProperty(CASE_TYPE_PROPERTY);
	}
}
