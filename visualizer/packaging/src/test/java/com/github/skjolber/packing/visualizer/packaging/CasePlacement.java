package com.github.skjolber.packing.visualizer.packaging;

import com.github.skjolber.packing.api.BoxStackValue;
import com.github.skjolber.packing.api.point.Point;
import com.github.skjolber.packing.packer.plain.PlainPlacement;

public class CasePlacement extends PlainPlacement {

	private static final long serialVersionUID = 1L;

	private final long sameTypeSupportArea;
	private final boolean nearSameCategory;

	public CasePlacement(BoxStackValue stackValue, Point point, long supportedArea,
			long sameTypeSupportArea, boolean nearSameCategory) {
		super(stackValue, point, supportedArea);
		this.sameTypeSupportArea = sameTypeSupportArea;
		this.nearSameCategory = nearSameCategory;
	}

	public long getSameTypeSupportArea() {
		return sameTypeSupportArea;
	}

	public long getSameTypeSupportPercent() {
		long area = getStackValue().getArea();
		if (area == 0) return 0;
		return (sameTypeSupportArea * 100) / area;
	}

	public boolean isNearSameCategory() {
		return nearSameCategory;
	}
}
