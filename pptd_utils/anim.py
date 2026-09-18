"""Animations (pptd 6.) -> OOXML p:timing tree.

PowerPoint timing model: mainSeq of click groups; each group holds "step"
pars launched with computed delays (withPrevious joins current step,
afterPrevious chains a new step after the previous one ends).
"""
from lxml import etree
from pptx.oxml.ns import qn

from .xmlutil import sub

P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"

# presetID, presetClass, default ms
EFFECTS = {
    "appear":       (1,  "entr", 1),
    "fade-in":      (10, "entr", 500),
    "fly-in":       (2,  "entr", 500),
    "zoom-in":      (23, "entr", 500),
    "wipe-in":      (22, "entr", 500),
    "float-in":     (42, "entr", 500),
    "peek-in":      (12, "entr", 500),
    "rise-in":      (33, "entr", 1000),
    "pulse":        (26, "emph", 600),
    "grow-shrink":  (6,  "emph", 2000),
    "spin":         (8,  "emph", 2000),
    "teeter":       (32, "emph", 1000),
    "fill-color":   (22, "emph", 2000),
    "transparency": (38, "emph", 2000),
    "color-pulse":  (36, "emph", 2000),
    "disappear":    (1,  "exit", 1),
    "fade-out":     (10, "exit", 500),
    "fly-out":      (2,  "exit", 500),
    "zoom-out":     (23, "exit", 500),
    "wipe-out":     (22, "exit", 500),
    "float-out":    (42, "exit", 500),
    "motion-path":  (0,  "path", 2000),
}
DIR_SUBTYPE = {"up": 4, "down": 1, "left": 8, "right": 2}


class _Ids:
    def __init__(self):
        self.n = 0

    def next(self):
        self.n += 1
        return self.n


def build_timing(slide, animations, shape_ids, slide_w=None, slide_h=None):
    if not animations:
        return
    slide_w = slide_w or 960
    slide_h = slide_h or 540
    sld = slide._element
    for e in sld.findall(qn("p:timing")):
        sld.remove(e)
    ids = _Ids()
    groups = _group(animations)
    timing = etree.SubElement(sld, qn("p:timing"))
    tnLst = sub(timing, "p:tnLst")
    root_par = sub(tnLst, "p:par")
    ctn = sub(root_par, "p:cTn", {"id": str(ids.next()), "dur": "indefinite",
                                  "restart": "never", "nodeType": "tmRoot"})
    child = sub(ctn, "p:childTnLst")
    seq = sub(child, "p:seq", {"concurrent": "1", "nextAc": "seek"})
    seq_ctn = sub(seq, "p:cTn", {"id": str(ids.next()), "dur": "indefinite",
                                 "nodeType": "mainSeq"})
    seq_child = sub(seq_ctn, "p:childTnLst")
    bldLst_shapes = []

    for gi, group in enumerate(groups):
        auto = group["auto"]  # first anim with/after previous -> plays on entry
        gpar = sub(seq_child, "p:par")
        gctn = sub(gpar, "p:cTn", {"id": str(ids.next()), "dur": "indefinite",
                                   "restart": "whenNotActive", "fill": "hold",
                                   "nodeType": "clickGroup" if not auto else "afterGroup",
                                   "presetID": "2", "presetClass": "entr"})
        gcond = sub(gctn, "p:stCondLst")
        sub(gcond, "p:cond", {"delay": "0" if auto else "indefinite"})
        gchild = sub(gctn, "p:childTnLst")
        t = 0  # cumulative time within group (ms)
        for step in group["steps"]:
            sp = sub(gchild, "p:par")
            spctn = sub(sp, "p:cTn", {"id": str(ids.next()),
                                      "fill": "hold", "nodeType": "clickEffect",
                                      "presetID": "2", "presetClass": "entr"})
            spcond = sub(spctn, "p:stCondLst")
            sub(spcond, "p:cond", {"delay": str(int(step["start"]))})
            spchild = sub(spctn, "p:childTnLst")
            for anim in step["anims"]:
                _effect(spchild, anim, shape_ids, ids, t=step["start"],
                        slide_w=slide_w, slide_h=slide_h)
                bldLst_shapes.append(anim["elementId"])
            t = step["end"]
    # seq prev/next conditions
    prev = sub(seq, "p:prevCondLst")
    c = sub(prev, "p:cond", {"evt": "onPrev", "delay": "0"})
    tgt = sub(c, "p:tgtEl")
    sub(tgt, "p:sldTgt")
    nxt = sub(seq, "p:nextCondLst")
    c = sub(nxt, "p:cond", {"evt": "onNext", "delay": "0"})
    tgt = sub(c, "p:tgtEl")
    sub(tgt, "p:sldTgt")

    if bldLst_shapes:
        bl = sub(timing, "p:bldLst")
        for sid in dict.fromkeys(bldLst_shapes):
            spid = shape_ids.get(sid)
            if spid:
                sub(bl, "p:bldP", {"spid": str(spid), "grpId": "0"})


def _group(anims):
    """Group into click groups and time-shifted steps."""
    groups = []
    cur_group = None
    cur_step = None
    t = 0
    for a in anims:
        trigger = a.get("trigger", "onClick")
        dur = _dur(a)
        delay = float(a.get("delayMs", 0) or 0)
        if cur_group is None or trigger == "onClick":
            cur_group = {"auto": trigger in ("withPrevious", "afterPrevious")
                         and not groups, "steps": []}
            groups.append(cur_group)
            t = 0
            cur_step = None
        if cur_step is None or trigger == "onClick":
            start = t + delay
            cur_step = {"start": start, "anims": [a],
                        "end": start + dur}
            cur_group["steps"].append(cur_step)
        elif trigger == "withPrevious":
            start = t + delay
            cur_step["anims"].append(a)
            cur_step["end"] = max(cur_step["end"], start + dur)
        else:  # afterPrevious
            start = cur_step["end"] + delay
            cur_step = {"start": start, "anims": [a],
                        "end": start + dur}
            cur_group["steps"].append(cur_step)
        t = cur_step["end"]
    return groups


def _dur(a):
    e = a.get("effect")
    if e in ("appear", "disappear"):
        return 1
    d = EFFECTS.get(e, (0, "entr", 500))[2]
    return float(a.get("durationMs") or d or 500)


def _effect(parent, anim, shape_ids, ids, t=0, slide_w=960, slide_h=540):
    spid = shape_ids.get(anim["elementId"])
    if spid is None:
        return
    effect = anim.get("effect")
    if effect not in EFFECTS:
        return
    pid, pclass, _ = EFFECTS[effect]
    dur = int(_dur(anim))
    delay = int(float(anim.get("delayMs", 0) or 0))
    direction = anim.get("direction", "up")
    repeat = int(anim.get("repeat", 1) or 1)
    easing = anim.get("easing", "linear")

    par = sub(parent, "p:par")
    attrs = {"id": str(ids.next()), "presetID": str(pid),
             "presetClass": pclass, "presetSubtype": "0",
             "fill": "hold", "grpId": "0",
             "nodeType": _node_type(anim)}
    if effect in ("fly-in", "wipe-in", "peek-in", "fly-out", "wipe-out"):
        attrs["presetSubtype"] = str(DIR_SUBTYPE.get(direction, 4))
    if repeat > 1:
        attrs["repeatCount"] = str(repeat)
    if easing == "ease-in":
        attrs["accel"] = "100000"
    elif easing == "ease-out":
        attrs["decel"] = "100000"
    elif easing == "ease-in-out":
        attrs["accel"] = "50000"
        attrs["decel"] = "50000"
    if effect in ("appear", "disappear"):
        attrs["dur"] = "1"
    ctn = sub(par, "p:cTn", attrs)
    st = sub(ctn, "p:stCondLst")
    sub(st, "p:cond", {"delay": str(delay)})
    child = sub(ctn, "p:childTnLst")

    def cbhvr(dur_ms, attr=None, additive=None):
        cb = etree.Element(qn("p:cBhvr"))
        if additive:
            cb.set("additive", additive)
        c = sub(cb, "p:cTn", {"id": str(ids.next()), "dur": str(max(1, int(dur_ms)))})
        tg = sub(cb, "p:tgtEl")
        sub(tg, "p:spTgt", {"spid": str(spid)})
        if attr:
            al = sub(cb, "p:attrNameLst")
            sub(al, "p:attrName", text=attr)
        return cb

    def set_vis(visible, dur_ms=1, delay_ms=0):
        s = etree.Element(qn("p:set"))
        cb = cbhvr(dur_ms)
        cb.find(qn("p:cTn")).set("fill", "hold")
        if delay_ms:
            cb.find(qn("p:cTn")).find(qn("p:stCondLst"))
        c = cb.find(qn("p:cTn"))
        st = sub(c, "p:stCondLst")
        sub(st, "p:cond", {"delay": str(delay_ms)})
        al = sub(cb, "p:attrNameLst")
        sub(al, "p:attrName", text="style.visibility")
        s.append(cb)
        to = sub(s, "p:to")
        sub(to, "p:strVal", {"val": "visible" if visible else "hidden"})
        return s

    def anim_effect(trans, filt, dur_ms):
        ae = etree.Element(qn("p:animEffect"), {"transition": trans, "filter": filt})
        ae.append(cbhvr(dur_ms))
        return ae

    def motion_xy(axis, frm, to, dur_ms):
        an = etree.Element(qn("p:anim"), {"calcmode": "lin", "valueType": "num"})
        cb = cbhvr(dur_ms, attr="ppt_%s" % axis, additive="base")
        an.append(cb)
        tav = sub(an, "p:tavLst")
        for tm, v in ((0, frm), (100000, to)):
            tv = sub(tav, "p:tav", {"tm": str(tm)})
            val = sub(tv, "p:val")
            sub(val, "p:strVal", {"val": v})
        return an

    if effect == "appear":
        child.append(set_vis(True))
    elif effect == "disappear":
        child.append(set_vis(False))
    elif effect == "fade-in":
        child.append(set_vis(True))
        child.append(anim_effect("in", "fade", dur))
    elif effect == "fade-out":
        child.append(anim_effect("out", "fade", dur))
        s = set_vis(False, delay_ms=dur)
        child.append(s)
    elif effect in ("fly-in", "float-in", "rise-in", "peek-in"):
        child.append(set_vis(True))
        dist = "0.1+#ppt_h/2" if effect in ("float-in",) else None
        if effect in ("fly-in", "float-in", "rise-in"):
            frm_y = {"up": "1+#ppt_h/2", "down": "0-#ppt_h/2",
                     "left": "#ppt_y", "right": "#ppt_y"}[direction if effect != "rise-in" else "up"]
            frm_x = {"up": "#ppt_x", "down": "#ppt_x", "left": "1+#ppt_w/2",
                     "right": "0-#ppt_w/2"}[direction if effect != "rise-in" else "up"]
            if effect == "float-in":
                frm_y = "0.1+#ppt_h/2" if direction == "up" else "-0.1-#ppt_h/2"
                frm_x = "#ppt_x"
            child.append(motion_xy("x", frm_x, "#ppt_x", dur))
            child.append(motion_xy("y", frm_y, "#ppt_y", dur))
        else:  # peek-in: wipe without fade
            filt = "wipe(%s)" % {"up": "up", "down": "down", "left": "right",
                                 "right": "left"}.get(direction, "up")
            child.append(anim_effect("in", filt, dur))
    elif effect in ("fly-out", "float-out"):
        to_y = {"up": "0-#ppt_h/2", "down": "1+#ppt_h/2"}.get(direction, "1+#ppt_h/2")
        child.append(motion_xy("y", "#ppt_y", to_y if direction in ("up", "down") else "#ppt_y", dur))
        if direction in ("left", "right"):
            to_x = "0-#ppt_w/2" if direction == "left" else "1+#ppt_w/2"
            child.append(motion_xy("x", "#ppt_x", to_x, dur))
        s = set_vis(False, delay_ms=dur)
        child.append(s)
    elif effect in ("zoom-in", "zoom-out"):
        child.append(set_vis(True))
        scale = etree.Element(qn("p:animScale"))
        cb = cbhvr(dur)
        scale.append(cb)
        if effect == "zoom-in":
            f = sub(scale, "p:from", {"x": "0", "y": "0"})
            t2 = sub(scale, "p:to", {"x": "100000", "y": "100000"})
        else:
            f = sub(scale, "p:from", {"x": "100000", "y": "100000"})
            t2 = sub(scale, "p:to", {"x": "0", "y": "0"})
        child.append(scale)
    elif effect in ("wipe-in", "wipe-out"):
        filt = "wipe(%s)" % {"up": "up", "down": "down", "left": "right",
                             "right": "left"}.get(direction, "up")
        child.append(set_vis(True))
        child.append(anim_effect("in" if effect == "wipe-in" else "out", filt, dur))
    elif effect == "pulse":
        scale = etree.Element(qn("p:animScale"))
        cb = cbhvr(dur)
        cb.find(qn("p:cTn")).set("autoRev", "1")
        scale.append(cb)
        sub(scale, "p:from", {"x": "100000", "y": "100000"})
        sub(scale, "p:to", {"x": "110000", "y": "110000"})
        child.append(scale)
    elif effect == "grow-shrink":
        scale = etree.Element(qn("p:animScale"))
        scale.append(cbhvr(dur))
        sub(scale, "p:to", {"x": "150000", "y": "150000"})
        child.append(scale)
    elif effect == "spin":
        rot = etree.Element(qn("p:animRot"), {"by": "21600000"})
        rot.append(cbhvr(dur))
        child.append(rot)
    elif effect == "teeter":
        rot = etree.Element(qn("p:animRot"), {"by": "60000"})
        cb = cbhvr(dur)
        cb.find(qn("p:cTn")).set("autoRev", "1")
        cb.find(qn("p:cTn")).set("repeatCount", "3")
        rot.append(cb)
        child.append(rot)
    elif effect in ("fill-color", "color-pulse"):
        ac = etree.Element(qn("p:animColor"), {"colorType": "rgb"})
        cb = cbhvr(dur, attr="fillcolor")
        if effect == "color-pulse":
            cb.find(qn("p:cTn")).set("autoRev", "1")
        ac.append(cb)
        to = sub(ac, "p:to")
        color = str(anim.get("color", "#FF0000")).lstrip("#")[:6]
        a = sub(to, "a:srgbClr", {"val": color.upper()})
        child.append(ac)
    elif effect == "transparency":
        an = etree.Element(qn("p:anim"), {"calcmode": "lin", "valueType": "num"})
        cb = cbhvr(dur, attr="style.opacity")
        an.append(cb)
        tav = sub(an, "p:tavLst")
        tv0 = sub(tav, "p:tav", {"tm": "0"})
        v0 = sub(tv0, "p:val")
        sub(v0, "p:fltVal", {"val": "1"})
        tv1 = sub(tav, "p:tav", {"tm": "100000"})
        v1 = sub(tv1, "p:val")
        sub(v1, "p:fltVal", {"val": str(anim.get("amount", 0))})
        child.append(an)
    elif effect == "motion-path":
        am = etree.Element(qn("p:animMotion"), {
            "origin": "parent",
            "path": _motion_path(anim.get("path", ""),
                                 slide_w, slide_h),
            "pathEditMode": "relative"})
        am.append(cbhvr(dur))
        child.append(am)


def _motion_path(path, sw, sh):
    """px path -> animMotion slide-fraction path (M/L/C pairs)."""
    import re
    path = re.sub(r"([A-Za-z])([-+0-9.])", r"\1 \2", str(path))
    out = []
    idx = 0
    for tok in re.finditer(r"[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?|[^\s,]+", path):
        t = tok.group(0)
        try:
            v = float(t)
            out.append(f"{(v / sw) if idx % 2 == 0 else (v / sh):.6f}")
            idx += 1
        except ValueError:
            out.append(t)
    return " ".join(out)


def _node_type(anim):
    return {"onClick": "clickEffect", "withPrevious": "withEffect",
            "afterPrevious": "afterEffect"}.get(anim.get("trigger", "onClick"),
                                                "clickEffect")
