"""Create the original, silent 20-second teaching clip used by DEMO-VIDEO.
Requires Pillow and ffmpeg. No external footage or network requests.
"""
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
out = root / 'src' / 'assets'
out.mkdir(exist_ok=True)
font_path = Path('C:/Windows/Fonts/msyh.ttc')
font = lambda size: ImageFont.truetype(str(font_path), size)
chapters = [
    ('01', '概览', '先看整体，再看细节', '记录材料的对象、构图与主要信息。'),
    ('02', '观察', '区分观察与推测', '先写看见了什么，再写你的解释与疑问。'),
    ('03', '记录', '留下可回看的线索', '把笔记关联到具体时间，方便复查与比较。'),
]
process = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '960x540', '-r', '15', '-i', '-', '-an', '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-pix_fmt', 'yuv420p', str(out / 'video-notes-demo.webm')], stdin=subprocess.PIPE)
for frame in range(300):
    t = frame / 15
    active = 0 if t < 5 else 1 if t < 10 else 2
    number, label, title, detail = chapters[active]
    im = Image.new('RGB', (960, 540), '#f6f6f3')
    d = ImageDraw.Draw(im)
    d.text((52, 34), '资料观察过程', font=font(20), fill='#555550')
    d.text((760, 38), '原创演示 · 无声', font=font(16), fill='#777770')
    d.line((52, 82, 908, 82), fill='#c9c9c3', width=1)
    d.text((52, 118), number + '  /  ' + label, font=font(24), fill='#666660')
    d.text((52, 184), title, font=font(47), fill='#222220')
    d.text((54, 267), detail, font=font(26), fill='#555550')
    for i, chapter in enumerate(chapters):
        x = 52 + i * 290
        d.rectangle((x, 355, x + 275, 417), fill='#292927' if i == active else '#eeeeea')
        d.text((x + 22, 371), chapter[0] + '  ' + chapter[1], font=font(21), fill='white' if i == active else '#777770')
    d.text((54, 464), '观察练习 · 非历史影像', font=font(16), fill='#777770')
    d.text((815, 464), f'00:{int(t):02d} / 00:20', font=font(16), fill='#777770')
    d.rectangle((52, 511, 908, 514), fill='#d9d9d3')
    d.rectangle((52, 511, 52 + int(856 * t / 20), 514), fill='#555550')
    if frame == 0: im.save(out / 'video-notes-poster.png', optimize=True)
    process.stdin.write(im.tobytes())
process.stdin.close()
if process.wait(): raise SystemExit('Video encoding failed')
print(out / 'video-notes-demo.webm')
