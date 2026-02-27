"""生成插件图标"""
from PIL import Image, ImageDraw

SIZES = [16, 32, 48, 128]
BG_COLOR = (79, 140, 255)  # #4f8cff
FG_COLOR = (255, 255, 255)

for size in SIZES:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 圆角矩形背景
    r = int(size * 0.2)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=BG_COLOR)

    p = int(size * 0.2)  # 内边距
    w = size - 2 * p

    # 浏览器外框
    br = int(size * 0.08)
    draw.rounded_rectangle([p, p, size - p - 1, size - p - 1], radius=br, outline=FG_COLOR, width=max(1, size // 20))

    # 顶部栏分隔线
    bar_y = p + int(w * 0.25)
    line_w = max(1, size // 20)
    draw.line([(p, bar_y), (size - p - 1, bar_y)], fill=FG_COLOR, width=line_w)

    # 导航栏小圆点
    dot_r = max(1, int(size * 0.035))
    dot_y = p + int(w * 0.125)
    for i in range(3):
        dx = p + int(w * 0.12) + i * int(w * 0.1)
        draw.ellipse([dx - dot_r, dot_y - dot_r, dx + dot_r, dot_y + dot_r], fill=FG_COLOR)

    # 闪电符号
    cx = size // 2
    cy = bar_y + (size - p - bar_y) // 2
    ls = int(w * 0.22)

    if size >= 32:
        bolt = [
            (cx, cy - ls),
            (cx - ls, cy + int(ls * 0.1)),
            (cx - int(ls * 0.1), cy + int(ls * 0.1)),
            (cx, cy + ls),
            (cx + ls, cy - int(ls * 0.1)),
            (cx + int(ls * 0.1), cy - int(ls * 0.1)),
        ]
        draw.polygon(bolt, fill=FG_COLOR)
    else:
        # 小尺寸用简单菱形
        draw.polygon([
            (cx, cy - ls),
            (cx - ls, cy),
            (cx, cy + ls),
            (cx + ls, cy),
        ], fill=FG_COLOR)

    img.save(f"icons/icon{size}.png")
    print(f"已生成 icons/icon{size}.png ({size}x{size})")

print("所有图标生成完成！")
