package com.github.skjolber.packing.visualizer.packaging;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.github.skjolber.packing.api.Box;
import com.github.skjolber.packing.api.BoxItem;
import com.github.skjolber.packing.api.Container;
import com.github.skjolber.packing.api.ContainerItem;
import com.github.skjolber.packing.api.PackagerResult;
import com.github.skjolber.packing.packer.plain.PlainPackager;

public class CsvPackerTest extends AbstractPackagerTest {

	static final String[] CONTAINER_CODES = {"53ft", "48ft", "26ft", "sprinter"};
	static final String[] CONTAINER_NAMES = {"53ft Semi Trailer", "48ft Semi Trailer", "26ft Box Truck", "Sprinter Van"};
	static final int[][] CONTAINER_DIMS = {
		{624, 100, 110, 45000},
		{576, 100, 110, 45000},
		{312, 96, 96, 26000},
		{170, 70, 64, 5000}
	};

	private List<BoxItem> loadCasesFromCsv() throws Exception {
		List<BoxItem> items = new ArrayList<>();

		try (InputStream is = getClass().getResourceAsStream("/cases.csv");
			 BufferedReader reader = new BufferedReader(new InputStreamReader(is))) {

			reader.readLine();
			String line;
			int index = 0;

			while ((line = reader.readLine()) != null) {
				if (line.isBlank()) continue;

				String[] cols = line.split(",", -1);
				String name = cols[0].trim();
				String category = cols[7].trim();
				boolean canFlip = Boolean.parseBoolean(cols[8].trim());

				String canBeStacked = cols.length > 9 ? cols[9].trim() : "TRUE";
				String canHaveOnTop = cols.length > 10 ? cols[10].trim() : "TRUE";

				int length = Integer.parseInt(cols[3].trim());
				int width = Integer.parseInt(cols[4].trim());
				int height = Integer.parseInt(cols[5].trim());
				int weight = Integer.parseInt(cols[6].trim());

				String id = name + "-" + category + "-" + index;

				Box.Builder builder = Box.newBuilder()
						.withId(id)
						.withDescription(name + " (" + category + ")")
						.withProperty(CasePlacementControls.CASE_TYPE_PROPERTY, name)
						.withProperty(CasePlacementControls.CATEGORY_PROPERTY, category)
						.withProperty(CasePlacementControls.CAN_BE_STACKED_PROPERTY, canBeStacked)
						.withProperty(CasePlacementControls.CAN_HAVE_ON_TOP_PROPERTY, canHaveOnTop)
						.withSize(length, width, height)
						.withWeight(weight);

				if (canFlip) {
					builder.withRotate3D();
				}

				items.add(new BoxItem(builder.build(), 1));
				index++;
			}
		}
		return items;
	}

	private List<ContainerItem> createTrucks(int containerTypeIdx) {
		int[] d = CONTAINER_DIMS[containerTypeIdx];
		return ContainerItem.newListBuilder()
				.withContainer(
						Container.newBuilder()
								.withDescription(CONTAINER_NAMES[containerTypeIdx])
								.withSize(d[0], d[1], d[2])
								.withEmptyWeight(0)
								.withMaxLoadWeight(d[3])
								.build()
				)
				.build();
	}

	private void packWithRules(boolean sameType, boolean noOverhang, boolean groupCat,
			int maxHeight, int containerType, String filename) throws Exception {
		List<BoxItem> cases = loadCasesFromCsv();
		List<ContainerItem> trucks = createTrucks(containerType);

		PlainPackager packager = PlainPackager.newBuilder()
				.withPlacementControlsBuilderFactory(
						new CasePlacementControlsBuilderFactory(sameType, noOverhang, groupCat, maxHeight))
				.build();

		PackagerResult result = packager.newResultBuilder()
				.withContainerItems(trucks)
				.withBoxItems(cases)
				.withMaxContainerCount(10)
				.build();

		if (!result.isSuccess()) {
			System.out.println(filename + ": FAILED (cases don't fit)");
			return;
		}

		System.out.println(filename + ": " + result.getContainers().size() + " truck(s), "
				+ result.getContainers().stream().mapToInt(c -> c.getStack().size()).sum() + " cases");

		DefaultPackagingResultVisualizerFactory p = new DefaultPackagingResultVisualizerFactory(true);
		File file = new File("../viewer/public/assets/" + filename);
		p.visualize(result.getContainers(), file);
	}

	static String configFilename(String containerCode, boolean sameType, boolean noOverhang,
			boolean groupCat, int maxHeight) {
		StringBuilder sb = new StringBuilder("pack-");
		sb.append(containerCode);
		if (sameType)   sb.append("-sametype");
		if (noOverhang) sb.append("-nohang");
		if (groupCat)   sb.append("-grouped");
		if (maxHeight > 0) sb.append("-h").append(maxHeight);
		sb.append(".json");
		return sb.toString();
	}

	@Test
	public void generateAllConfigs() throws Exception {
		int[] heights = {2, 3, 0};
		for (int ct = 0; ct < CONTAINER_CODES.length; ct++) {
			for (boolean st : new boolean[]{true, false}) {
				for (boolean nh : new boolean[]{true, false}) {
					for (boolean gc : new boolean[]{true, false}) {
						for (int h : heights) {
							packWithRules(st, nh, gc, h, ct,
									configFilename(CONTAINER_CODES[ct], st, nh, gc, h));
						}
					}
				}
			}
		}
		packWithRules(true, true, true, 3, 0, "containers.json");
	}

	@Test
	public void packCaseRules() throws Exception {
		packWithRules(true, true, true, 3, 0, "containers.json");
	}
}
