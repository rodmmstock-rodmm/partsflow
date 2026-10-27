from io import BytesIO
import unittest

from PIL import Image

from core.image_optimizer import MAX_IMAGE_EDGE, optimize_part_image


def make_image(image_format, size=(32, 24), mode="RGB", color=None):
    image = Image.new(mode, size, color or (20, 80, 140))
    output = BytesIO()
    image.save(output, format=image_format)
    return output.getvalue()


class OptimizePartImageTests(unittest.TestCase):
    def test_gif_is_left_unchanged(self):
        payload = make_image("GIF", mode="P", color=1)
        optimized, content_type = optimize_part_image(payload, "image/gif")
        self.assertEqual(optimized, payload)
        self.assertEqual(content_type, "image/gif")

    def test_png_keeps_transparency(self):
        payload = make_image("PNG", mode="RGBA", color=(20, 80, 140, 0))
        optimized, content_type = optimize_part_image(payload, "image/png")
        self.assertEqual(content_type, "image/png")
        with Image.open(BytesIO(optimized)) as result:
            self.assertIn("A", result.getbands())
            self.assertEqual(result.getpixel((0, 0))[3], 0)

    def test_invalid_payload_is_rejected(self):
        with self.assertRaises(ValueError):
            optimize_part_image(b"not an image", "image/jpeg")

    def test_unknown_content_type_is_rejected(self):
        with self.assertRaises(ValueError):
            optimize_part_image(b"anything", "application/octet-stream")


if __name__ == "__main__":
    unittest.main()
