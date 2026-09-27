import re, html, os
d = os.path.dirname(os.path.abspath(__file__))
for f in ("si119", "si588"):
    t = open(os.path.join(d, f + ".html"), encoding="utf-8").read()
    t = re.sub(r"(?s)<(script|style).*?</\1>", "", t)
    t = re.sub(r"<br\s*/?>|</p>|</tr>|</div>|</h\d>", "\n", t)
    t = re.sub(r"</t[dh]>", " | ", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t)
    t = re.sub(r"[ \t\xa0]+", " ", t)
    t = re.sub(r"\n\s*\n+", "\n", t)
    open(os.path.join(d, f + ".txt"), "w").write(t)
    print(f, len(t.splitlines()))
