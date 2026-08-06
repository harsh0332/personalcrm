import os
from PIL import Image, ImageDraw

icons_dir = os.path.join(os.getcwd(), "public", "icons")
os.makedirs(icons_dir, exist_ok=True)

def create_pwa_icon(size, is_maskable=False, is_apple=False):
    # Base Canvas
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Fill background
    bg_color = (9, 9, 11, 255) # #09090b
    
    if is_apple or is_maskable:
        # Full square for Apple and Android Maskable adaptive background
        draw.rectangle([0, 0, size, size], fill=bg_color)
    else:
        # Standard rounded rectangle
        corner_radius = int(size * 0.22)
        draw.rounded_rectangle([0, 0, size, size], radius=corner_radius, fill=bg_color)
        
    scale = 0.75 if is_maskable else 0.85
    center_x = size // 2
    center_y = size // 2
    
    # Outer emerald ring
    ring_radius = int(size * 0.32 * scale)
    ring_width = int(size * 0.04 * scale)
    draw.ellipse(
        [center_x - ring_radius, center_y - ring_radius, center_x + ring_radius, center_y + ring_radius],
        outline=(5, 150, 105, 255),
        width=ring_width
    )
    
    # Inner emerald circle
    inner_radius = int(size * 0.25 * scale)
    draw.ellipse(
        [center_x - inner_radius, center_y - inner_radius, center_x + inner_radius, center_y + inner_radius],
        fill=(16, 185, 129, 255) # #10b981
    )
    
    # Phone Handle Icon in center
    phone_radius = int(inner_radius * 0.45)
    
    # Left receiver circle
    draw.ellipse(
        [center_x - phone_radius - 5, center_y - 10, center_x - phone_radius + 15, center_y + 10],
        fill=(9, 9, 11, 255)
    )
    # Right receiver circle
    draw.ellipse(
        [center_x + phone_radius - 15, center_y - 10, center_x + phone_radius + 5, center_y + 10],
        fill=(9, 9, 11, 255)
    )
    # Connecting handle bar
    draw.line(
        [center_x - phone_radius + 5, center_y, center_x + phone_radius - 5, center_y],
        fill=(9, 9, 11, 255),
        width=int(size * 0.05 * scale)
    )
    
    # Inner white accent ring inside phone badge
    draw.ellipse(
        [center_x - int(inner_radius * 0.3), center_y - int(inner_radius * 0.3), center_x + int(inner_radius * 0.3), center_y + int(inner_radius * 0.3)],
        outline=(255, 255, 255, 255),
        width=int(size * 0.02 * scale)
    )

    return img

print("Generating 5 crisp PWA PNG icons...")
create_pwa_icon(192).save(os.path.join(icons_dir, "icon-192x192.png"))
create_pwa_icon(512).save(os.path.join(icons_dir, "icon-512x512.png"))
create_pwa_icon(192, is_maskable=True).save(os.path.join(icons_dir, "icon-maskable-192x192.png"))
create_pwa_icon(512, is_maskable=True).save(os.path.join(icons_dir, "icon-maskable-512x512.png"))
create_pwa_icon(180, is_apple=True).save(os.path.join(icons_dir, "apple-touch-icon.png"))
print("[SUCCESS] All 5 PWA icons generated in public/icons/")
