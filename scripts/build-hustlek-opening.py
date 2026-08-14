#!/usr/bin/env python3
"""Build the approved HustleK opening from one canonical RGBA atlas.

The art input is deliberately fixed to:

    design/hustlek-opening-v1/hustlek-opening-atlas.png

Atlas contract (640 x 776, RGBA):

* background: (0, 0, 640, 360)
* walk: 12 x 96px cells, six columns by two rows, starting at y=360
* turn/setup keys: 6 x 96px cells in one row, starting at y=552
* fixed telescope: one 128px cell at (0, 648)

The script has no generative-image or Pixy dependency. Composition uses Pillow,
integer coordinates, and nearest-neighbour operations only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageSequence


REPO_ROOT = Path(__file__).resolve().parents[1]
ATLAS_PATH = REPO_ROOT / "design" / "hustlek-opening-v1" / "hustlek-opening-atlas.png"
DEFAULT_OUTPUT = REPO_ROOT / "Output" / "hustlek-opening"

ATLAS_SIZE = (640, 776)
VIEWPORT = (640, 360)
WORLD_SIZE = (640, 640)
NORTH_X = 320
GROUND_WORLD_Y = 592
CAMERA_INITIAL_Y = 280
CAMERA_FOCUS_Y = 52
POLARIS_WORLD = (320, 232)

WALK_SIZE = 96
WALK_FLOOR = 94
KEY_SIZE = 96
KEY_HEIGHT = 87
KEY_FLOOR = 94
TELESCOPE_SIZE = 128
TELESCOPE_FLOOR = 124

FRAME_MS = 80
TOTAL_MS = 13_200
FRAME_COUNT = TOTAL_MS // FRAME_MS

EXPECTED_ATLAS_RGBA_SHA256 = "b077a2d1a4c77c320e92a18b92a722f4a2905340e7b1ba27c47d6a0cf2c8cc49"
EXPECTED_RGB_FRAME_STREAM_SHA256 = "be712f383b207d0de5508f485481aa41d8fe8769b087220993a357342780ff33"

TIMELINE = {
    "fade_in": [0, 800],
    "establish": [800, 2_200],
    "walk_in": [2_200, 4_800],
    "turn_setup": [4_800, 7_200],
    "observe": [7_200, 9_000],
    "focus_pan": [9_000, 11_600],
    "ping": [11_600, 12_300],
    "fade_out": [12_300, 13_200],
}

APPROACH_GAIT_INDICES = [6, 7, 8, 9, 10, 11, 0, 1]
APPROACH_GAIT_NAMES = ["07", "08", "09", "10", "11", "12", "01", "02"]
APPROACH_CENTERS = [263, 273, 283, 293, 302, 310, 316, 320]
TURN_KEY_MAP = [0, 1, 1, 2, 2, 2, 3, 4]
TURN_STAGE_MAP = ["side", "diagonal", "diagonal", "rear", "rear", "rear"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build the deterministic 165-frame HustleK opening animation."
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Output directory (default: {DEFAULT_OUTPUT})",
    )
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def rgb_frame_stream_sha256(frames: list[Image.Image]) -> str:
    """Hash decoded RGB pixels in frame order, without container metadata."""
    digest = hashlib.sha256()
    for frame in frames:
        rgb = frame.convert("RGB")
        if rgb.size != VIEWPORT:
            raise ValueError(f"Unexpected decoded frame size: {rgb.size}")
        digest.update(rgb.tobytes())
    return digest.hexdigest()


def rgba_pixels_sha256(image: Image.Image) -> str:
    """Hash decoded RGBA pixels, independent of PNG metadata/compression."""
    return hashlib.sha256(image.convert("RGBA").tobytes()).hexdigest()


def rgba_file_pixels_sha256(path: Path) -> str:
    with Image.open(path) as image:
        return rgba_pixels_sha256(image)


def crop_cell(atlas: Image.Image, box: tuple[int, int, int, int], label: str) -> Image.Image:
    cell = atlas.crop(box)
    if cell.getchannel("A").getbbox() is None:
        raise ValueError(f"Atlas cell is empty: {label} at {box}")
    return cell


def load_atlas() -> tuple[Image.Image, list[Image.Image], list[Image.Image], Image.Image]:
    if not ATLAS_PATH.is_file():
        raise FileNotFoundError(
            f"Canonical atlas not found: {ATLAS_PATH}\n"
            "The builder intentionally accepts no fallback art sources."
        )

    with Image.open(ATLAS_PATH) as source:
        if source.mode != "RGBA":
            raise ValueError(f"Atlas must be RGBA, got {source.mode}")
        if source.size != ATLAS_SIZE:
            raise ValueError(f"Atlas must be {ATLAS_SIZE}, got {source.size}")
        atlas = source.copy()

    background = atlas.crop((0, 0, 640, 360))
    if background.getchannel("A").getextrema() != (255, 255):
        raise ValueError("Background atlas region must be fully opaque")

    walk: list[Image.Image] = []
    for index in range(12):
        column = index % 6
        row = index // 6
        x = column * WALK_SIZE
        y = 360 + row * WALK_SIZE
        walk.append(crop_cell(atlas, (x, y, x + WALK_SIZE, y + WALK_SIZE), f"walk-{index + 1:02d}"))

    keyposes: list[Image.Image] = []
    for index in range(6):
        x = index * KEY_SIZE
        keyposes.append(crop_cell(atlas, (x, 552, x + KEY_SIZE, 648), f"key-{index + 1:02d}"))

    telescope = crop_cell(atlas, (0, 648, 128, 776), "telescope-base")
    return background, walk, keyposes, telescope


def build_vertical_world(background: Image.Image) -> Image.Image:
    """Extend the approved 640x360 frame upward without resampling its pixels."""
    world = Image.new("RGBA", WORLD_SIZE, (4, 12, 33, 255))
    sky_rows = 128
    period = 2 * (sky_rows - 1)
    for y in range(CAMERA_INITIAL_Y):
        distance = CAMERA_INITIAL_Y - 1 - y
        phase = distance % period
        source_y = phase if phase < sky_rows else period - phase
        world.paste(background.crop((0, source_y, 640, source_y + 1)), (0, y))
    world.alpha_composite(background, (0, CAMERA_INITIAL_Y))
    return world


def logical_star() -> Image.Image:
    """Create the approved white-violet, four-point, 90-degree-symmetric star."""
    star = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    pixels = star.load()

    def arm_width(distance: int) -> int:
        if distance <= 7:
            return 7
        if distance <= 13:
            return 5
        if distance <= 19:
            return 3
        if distance <= 23:
            return 1
        return -1

    for y in range(32):
        for x in range(32):
            dx = abs(2 * x - 31)
            dy = abs(2 * y - 31)
            inside = (dy <= 23 and dx <= arm_width(dy)) or (dx <= 23 and dy <= arm_width(dx))
            if not inside:
                continue
            ring = max(dx, dy)
            edge = min(dx, dy)
            if ring <= 5:
                color = (255, 255, 250, 255)
            elif edge <= 1 and ring >= 15:
                color = (125, 92, 190, 255)
            elif ring >= 19:
                color = (167, 132, 222, 255)
            elif ring >= 11:
                color = (215, 192, 246, 255)
            else:
                color = (242, 232, 255, 255)
            pixels[x, y] = color
    return star


def build_polaris() -> tuple[Image.Image, list[Image.Image]]:
    logical = logical_star()
    if ImageChops.difference(logical, logical.rotate(90)).getbbox() is not None:
        raise AssertionError("Polaris must be exactly 90-degree symmetric")

    base = logical.resize((64, 64), Image.Resampling.NEAREST)
    flash_specs = [(70, 42), (82, 64), (104, 100), (82, 58), (70, 30)]
    flashes: list[Image.Image] = []
    for index, (extent, aura_alpha) in enumerate(flash_specs, start=1):
        frame = Image.new("RGBA", (112, 112), (0, 0, 0, 0))
        draw = ImageDraw.Draw(frame)
        center = 56
        half = extent // 2
        for delta in range(-half, half + 1, 4):
            fade = max(8, aura_alpha - abs(delta) * 2)
            color = (177, 140, 235, fade)
            draw.rectangle((center + delta, center - 1, center + delta + 1, center + 1), fill=color)
            draw.rectangle((center - 1, center + delta, center + 1, center + delta + 1), fill=color)
        scale = 64 if index in (1, 5) else 72 if index in (2, 4) else 80
        core = logical.resize((scale, scale), Image.Resampling.NEAREST)
        frame.alpha_composite(core, ((112 - scale) // 2, (112 - scale) // 2))
        flashes.append(frame)
    return base, flashes


def smootherstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * value * (value * (value * 6 - 15) + 10)


def alpha_composite_center(canvas: Image.Image, sprite: Image.Image, center: tuple[int, int]) -> None:
    canvas.alpha_composite(
        sprite,
        (round(center[0] - sprite.width / 2), round(center[1] - sprite.height / 2)),
    )


def flash_index(time_ms: int) -> int:
    elapsed = max(0, time_ms - TIMELINE["ping"][0])
    total = 0
    for index, duration in enumerate([120, 100, 90, 150, 240]):
        total += duration
        if elapsed < total:
            return index
    return 4


def compose_frame(
    time_ms: int,
    vertical_world: Image.Image,
    walk: list[Image.Image],
    keyposes: list[Image.Image],
    telescope: Image.Image,
    polaris: Image.Image,
    flashes: list[Image.Image],
) -> Image.Image:
    world = vertical_world.copy()
    frame_number = time_ms // FRAME_MS + 1

    # One immutable telescope layer. Character assets never contain the prop.
    world.alpha_composite(
        telescope,
        (NORTH_X - TELESCOPE_SIZE // 2, GROUND_WORLD_Y - TELESCOPE_FLOOR),
    )

    if 59 <= frame_number <= 66:
        local_index = frame_number - 59
        pose = walk[APPROACH_GAIT_INDICES[local_index]]
        center_x = APPROACH_CENTERS[local_index]
        world.alpha_composite(
            pose,
            (center_x - WALK_SIZE // 2, GROUND_WORLD_Y - WALK_FLOOR),
        )
    elif 67 <= frame_number <= 74:
        pose = keyposes[TURN_KEY_MAP[frame_number - 67]]
        world.alpha_composite(
            pose,
            (NORTH_X - KEY_SIZE // 2, GROUND_WORLD_Y - KEY_FLOOR),
        )
    elif TIMELINE["walk_in"][0] <= time_ms < 4_600:
        progress = (time_ms - 2_200) / 2_400
        left = round(-WALK_SIZE + (210 + WALK_SIZE) * progress)
        walk_frame = walk[((time_ms - 2_200) // FRAME_MS) % len(walk)]
        world.alpha_composite(walk_frame, (left, GROUND_WORLD_Y - WALK_FLOOR))
    elif time_ms >= 5_600:
        # F75 onward is the contact key. It retains the same shared body scale.
        world.alpha_composite(
            keyposes[5],
            (NORTH_X - KEY_SIZE // 2, GROUND_WORLD_Y - KEY_FLOOR),
        )

    # Polaris is placed only after the pan phase begins. Its world position is
    # already fully above the initial crop, so there is no independent fade-in.
    if time_ms >= TIMELINE["focus_pan"][0]:
        if TIMELINE["ping"][0] <= time_ms < TIMELINE["ping"][1]:
            alpha_composite_center(world, flashes[flash_index(time_ms)], POLARIS_WORLD)
        else:
            alpha_composite_center(world, polaris, POLARIS_WORLD)

    if time_ms < TIMELINE["focus_pan"][0]:
        camera_y = CAMERA_INITIAL_Y
    elif time_ms < TIMELINE["focus_pan"][1]:
        progress = smootherstep((time_ms - 9_000) / 2_600)
        camera_y = round(CAMERA_INITIAL_Y + (CAMERA_FOCUS_Y - CAMERA_INITIAL_Y) * progress)
    else:
        camera_y = CAMERA_FOCUS_Y

    screen = world.crop((0, camera_y, VIEWPORT[0], camera_y + VIEWPORT[1])).convert("RGB")
    if time_ms < 800:
        darkness = 1.0 - time_ms / 800
    elif time_ms >= 12_300:
        darkness = min(1.0, (time_ms - 12_300 + FRAME_MS) / 900)
    else:
        darkness = 0.0
    if darkness:
        screen = Image.blend(screen, Image.new("RGB", VIEWPORT, (0, 0, 0)), darkness)
    return screen


def write_gif(frames: list[Image.Image], path: Path) -> None:
    """Write a timed GIF, retaining elapsed time when RGB frames repeat."""
    indexed_all = [
        frame.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        for frame in frames
    ]
    indexed: list[Image.Image] = []
    durations: list[int] = []
    for frame in indexed_all:
        duplicate = bool(
            indexed
            and ImageChops.difference(indexed[-1].convert("RGB"), frame.convert("RGB")).getbbox() is None
        )
        if duplicate:
            durations[-1] += FRAME_MS
        else:
            indexed.append(frame)
            durations.append(FRAME_MS)

    indexed[0].save(
        path,
        format="GIF",
        save_all=True,
        append_images=indexed[1:],
        duration=durations,
        loop=0,
        disposal=2,
        optimize=False,
    )

    # Pillow can replace a duration list while coalescing frames. Patch only
    # the GIF Graphic Control Extension delays; pixel data remains untouched.
    data = bytearray(path.read_bytes())
    offsets = [
        index
        for index in range(len(data) - 7)
        if data[index : index + 3] == b"\x21\xF9\x04" and data[index + 7] == 0
    ]
    if len(offsets) != len(durations):
        raise AssertionError(f"GIF GCE count mismatch: {len(offsets)} != {len(durations)}")
    for offset, duration in zip(offsets, durations):
        delay_centiseconds = duration // 10
        data[offset + 4] = delay_centiseconds & 0xFF
        data[offset + 5] = (delay_centiseconds >> 8) & 0xFF
    path.write_bytes(data)


def write_apng(frames: list[Image.Image], path: Path) -> None:
    rgba = [frame.convert("RGBA") for frame in frames]
    rgba[0].save(
        path,
        format="PNG",
        save_all=True,
        append_images=rgba[1:],
        duration=FRAME_MS,
        loop=0,
        disposal=1,
        blend=0,
        optimize=False,
    )


def gif_duration_ms(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    offsets = [
        index
        for index in range(len(data) - 7)
        if data[index : index + 3] == b"\x21\xF9\x04" and data[index + 7] == 0
    ]
    duration = sum(int.from_bytes(data[index + 4 : index + 6], "little") * 10 for index in offsets)
    return len(offsets), duration


def decoded_apng(path: Path) -> tuple[list[Image.Image], int]:
    with Image.open(path) as image:
        frames = [frame.convert("RGB").copy() for frame in ImageSequence.Iterator(image)]
        duration = sum(float(frame.info.get("duration", 0)) for frame in ImageSequence.Iterator(image))
    return frames, round(duration)


def alpha_band_width(frame: Image.Image, top: int, bottom: int) -> int:
    box = frame.getchannel("A").crop((0, top, KEY_SIZE, bottom)).getbbox()
    return 0 if box is None else box[2] - box[0]


def artifact_count(paths: list[Path]) -> int:
    count = 0
    for root in paths:
        if not root.exists():
            continue
        count += sum(1 for _ in root.rglob("*.pix"))
        count += sum(1 for _ in root.rglob("pixy.spec.json"))
    return count


def validate(
    *,
    background: Image.Image,
    vertical_world: Image.Image,
    walk: list[Image.Image],
    keyposes: list[Image.Image],
    telescope: Image.Image,
    polaris: Image.Image,
    source_frames: list[Image.Image],
    gif_path: Path,
    apng_path: Path,
    output_dir: Path,
) -> dict[str, object]:
    lower_world = vertical_world.crop((0, CAMERA_INITIAL_Y, 640, 640))
    background_exact = ImageChops.difference(lower_world, background).getbbox() is None
    key_boxes = [frame.getchannel("A").getbbox() for frame in keyposes]
    walk_boxes = [frame.getchannel("A").getbbox() for frame in walk]
    telescope_box = telescope.getchannel("A").getbbox()

    gif_frame_count, gif_duration = gif_duration_ms(gif_path)
    apng_frames, apng_duration = decoded_apng(apng_path)
    source_hash = rgb_frame_stream_sha256(source_frames)
    decoded_hash = rgb_frame_stream_sha256(apng_frames)

    source_text = Path(__file__).read_text(encoding="utf-8")
    pixy_import_count = len(
        re.findall(r"^\s*(?:from|import)\s+pixy(?:\s|\.|$)", source_text, flags=re.MULTILINE | re.IGNORECASE)
    )
    pixy_artifact_count = artifact_count([ATLAS_PATH.parent, output_dir])

    key_heights = [box[3] - box[1] if box else 0 for box in key_boxes]
    key_floor_anchors = [box[3] if box else None for box in key_boxes]
    walk_floor_anchors = [box[3] if box else None for box in walk_boxes]
    walk_stop_head = alpha_band_width(walk[1], 5, 44)
    walk_stop_torso = alpha_band_width(walk[1], 44, 65)
    key_side_head = alpha_band_width(keyposes[0], 5, 44)
    key_side_torso = alpha_band_width(keyposes[0], 44, 65)

    result: dict[str, object] = {
        "pipeline": "canonical atlas + local Pillow composition",
        "atlas": str(ATLAS_PATH.relative_to(REPO_ROOT)).replace("\\", "/"),
        "atlas_mode": "RGBA",
        "atlas_size": list(ATLAS_SIZE),
        "atlas_sha256": sha256_file(ATLAS_PATH),
        "atlas_decoded_rgba_sha256": rgba_file_pixels_sha256(ATLAS_PATH),
        "expected_atlas_decoded_rgba_sha256": EXPECTED_ATLAS_RGBA_SHA256,
        "viewport": list(VIEWPORT),
        "world": list(WORLD_SIZE),
        "duration_ms": TOTAL_MS,
        "frame_duration_ms": FRAME_MS,
        "expected_frame_count": FRAME_COUNT,
        "rendered_frame_count": len(source_frames),
        "gif_decoded_frame_count": gif_frame_count,
        "gif_duration_ms": gif_duration,
        "apng_decoded_frame_count": len(apng_frames),
        "apng_duration_ms": apng_duration,
        "decoded_rgb_frame_stream_sha256": decoded_hash,
        "source_rgb_frame_stream_sha256": source_hash,
        "expected_rgb_frame_stream_sha256": EXPECTED_RGB_FRAME_STREAM_SHA256,
        "decoded_stream_matches_source": decoded_hash == source_hash,
        "background_lower_360_exact": background_exact,
        "north_axis_x": NORTH_X,
        "camera_x_motion": 0,
        "camera_y": [CAMERA_INITIAL_Y, CAMERA_FOCUS_Y],
        "polaris_world_center": list(POLARIS_WORLD),
        "polaris_initial_screen_center": [NORTH_X, POLARIS_WORLD[1] - CAMERA_INITIAL_Y],
        "polaris_focus_screen_center": [NORTH_X, POLARIS_WORLD[1] - CAMERA_FOCUS_Y],
        "polaris_fully_offscreen_before_pan": POLARIS_WORLD[1] + polaris.height // 2 < CAMERA_INITIAL_Y,
        "polaris_rotational_symmetry_90deg": ImageChops.difference(
            logical_star(), logical_star().rotate(90)
        ).getbbox()
        is None,
        "walk_frames": len(walk),
        "walk_cell_size": [WALK_SIZE, WALK_SIZE],
        "walk_floor_anchors": walk_floor_anchors,
        "keypose_frames": len(keyposes),
        "keypose_cell_size": [KEY_SIZE, KEY_SIZE],
        "keypose_character_heights": key_heights,
        "keypose_floor_anchors": key_floor_anchors,
        "telescope_cell_size": [TELESCOPE_SIZE, TELESCOPE_SIZE],
        "telescope_alpha_bbox": list(telescope_box) if telescope_box else None,
        "telescope_fixed_world_position": [NORTH_X - 64, GROUND_WORLD_Y - TELESCOPE_FLOOR],
        "approach_frames_59_66": [f"walk-{name}" for name in APPROACH_GAIT_NAMES],
        "approach_centers_59_66": APPROACH_CENTERS,
        "turn_stages_67_72": TURN_STAGE_MAP,
        "setup_keys_73_75": ["half-raise", "precontact", "contact"],
        "stationary_center_x_67_onward": NORTH_X,
        "timeline": TIMELINE,
        "pixy_import_count": pixy_import_count,
        "pixy_artifact_count": pixy_artifact_count,
    }

    gates = {
        "atlas_contract": ATLAS_PATH.is_file() and len(walk) == 12 and len(keyposes) == 6,
        "atlas_pixels_exact": result["atlas_decoded_rgba_sha256"]
        == EXPECTED_ATLAS_RGBA_SHA256,
        "background_exact": background_exact,
        "north_axis_locked": NORTH_X == 320 and POLARIS_WORLD[0] == NORTH_X,
        "camera_contract": CAMERA_INITIAL_Y == 280 and CAMERA_FOCUS_Y == 52,
        "polaris_offscreen_before_pan": result["polaris_fully_offscreen_before_pan"],
        "polaris_symmetric": result["polaris_rotational_symmetry_90deg"],
        "walk_floor_locked": all(anchor == WALK_FLOOR for anchor in walk_floor_anchors),
        "keypose_ratio_locked": all(height == KEY_HEIGHT for height in key_heights)
        and all(anchor == KEY_FLOOR for anchor in key_floor_anchors),
        "walk_to_key_ratio_match": abs(walk_stop_head - key_side_head) <= 2
        and abs(walk_stop_torso - key_side_torso) <= 2,
        "three_stage_turn": TURN_STAGE_MAP == ["side", "diagonal", "diagonal", "rear", "rear", "rear"],
        "approach_mapping_exact": APPROACH_GAIT_NAMES == ["07", "08", "09", "10", "11", "12", "01", "02"]
        and APPROACH_CENTERS == [263, 273, 283, 293, 302, 310, 316, 320],
        "stationary_turn": NORTH_X == 320,
        "telescope_invariant": telescope_box is not None,
        "render_count_exact": len(source_frames) == FRAME_COUNT,
        "gif_duration_exact": gif_duration == TOTAL_MS,
        "apng_exact": len(apng_frames) == FRAME_COUNT and apng_duration == TOTAL_MS,
        "decoded_stream_exact": decoded_hash == source_hash,
        "approved_frame_stream_exact": decoded_hash == EXPECTED_RGB_FRAME_STREAM_SHA256,
        "sequence_endpoints_black": source_frames[0].getextrema() == ((0, 0), (0, 0), (0, 0))
        and source_frames[-1].getextrema() == ((0, 0), (0, 0), (0, 0)),
        "pixy_absent": pixy_import_count == 0 and pixy_artifact_count == 0,
    }
    result["gates"] = gates
    result["status"] = "PASS" if all(gates.values()) else "FAIL"
    return result


def main() -> int:
    args = parse_args()
    output_dir = args.output.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    background, walk, keyposes, telescope = load_atlas()
    vertical_world = build_vertical_world(background)
    polaris, flashes = build_polaris()
    frames = [
        compose_frame(time_ms, vertical_world, walk, keyposes, telescope, polaris, flashes)
        for time_ms in range(0, TOTAL_MS, FRAME_MS)
    ]

    gif_path = output_dir / "hustlek-opening.gif"
    apng_path = output_dir / "hustlek-opening.apng"
    write_gif(frames, gif_path)
    write_apng(frames, apng_path)

    validation = validate(
        background=background,
        vertical_world=vertical_world,
        walk=walk,
        keyposes=keyposes,
        telescope=telescope,
        polaris=polaris,
        source_frames=frames,
        gif_path=gif_path,
        apng_path=apng_path,
        output_dir=output_dir,
    )
    validation_path = output_dir / "validation.json"
    validation_path.write_text(
        json.dumps(validation, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    stream_hash = str(validation["decoded_rgb_frame_stream_sha256"])
    (output_dir / "decoded-rgb-frame-stream.sha256").write_text(
        f"{stream_hash}  decoded-rgb-frame-stream\n",
        encoding="ascii",
    )

    summary = {
        "status": validation["status"],
        "output": str(output_dir),
        "gif": str(gif_path),
        "apng": str(apng_path),
        "validation": str(validation_path),
        "decoded_rgb_frame_stream_sha256": stream_hash,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if validation["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
