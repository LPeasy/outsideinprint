#!/usr/bin/env python3
"""Stage an approved alternating Almanack for immediate web publication, offline.

The package stays draft:true. Only that scalar changes in the staged Markdown.
The approved static presentation becomes a source-bound Hugo asset; it is never
a separately hand-edited edition. This command performs no remote/email action.
"""
import argparse
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import runpy

ROOT=Path(__file__).resolve().parents[1]
HELPER=runpy.run_path(str(ROOT/"scripts/stage_almanack_publication.py"))
LAYOUT="alternating-margins-v1"
SCHEMA="oip-almanack-web-fragment/v1"
CSS_PATH="assets/css/almanack-alternating-v1.css"
VOID=set("area base br col embed hr img input link meta param source track wbr".split())


def sha(value):return hashlib.sha256(value).hexdigest()
def dump(value):return (json.dumps(value,ensure_ascii=False,indent=2)+"\n").encode()


class Node:
    def __init__(self,tag,attrs=()):self.tag,self.attrs,self.children=tag,dict(attrs),[]
    def all(self):
        for child in self.children:
            if isinstance(child,Node):yield child;yield from child.all()
    def markup(self):
        attributes="".join(f' {key}="{html.escape(str(value),quote=True)}"' if value is not None else " "+key for key,value in self.attrs.items())
        opening="<"+self.tag+attributes+">"
        return opening if self.tag in VOID else opening+"".join(child.markup() if isinstance(child,Node) else child for child in self.children)+"</"+self.tag+">"


class Tree(HTMLParser):
    def __init__(self,value):super().__init__(convert_charrefs=False);self.root=Node("root");self.stack=[self.root];self.feed(value);self.close()
    def handle_starttag(self,tag,attrs):
        value=Node(tag,attrs);self.stack[-1].children.append(value)
        if tag not in VOID:self.stack.append(value)
    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs)
        if tag not in VOID:self.stack.pop()
    def handle_endtag(self,tag):
        for index in range(len(self.stack)-1,0,-1):
            if self.stack[index].tag==tag:del self.stack[index:];break
    def handle_data(self,value):self.stack[-1].children.append(value)
    def handle_entityref(self,value):self.handle_data("&"+value+";")
    def handle_charref(self,value):self.handle_data("&#"+value+";")


def scope_css(value):
    """Scope the approved simple rules/media blocks to this one sheet."""
    value=re.sub(r"/\*.*?\*/","",value,flags=re.S);output=[];cursor=0
    while cursor<len(value):
        opening=value.find("{",cursor)
        if opening<0:
            if value[cursor:].strip():raise ValueError("Unsupported trailing CSS.")
            break
        selector=value[cursor:opening].strip();depth=1;end=opening+1
        while end<len(value) and depth:
            depth+=(value[end]=="{")-(value[end]=="}");end+=1
        if depth:raise ValueError("Unbalanced approved CSS.")
        inner=value[opening+1:end-1]
        if selector.startswith("@media"):output.append(selector+"{"+scope_css(inner)+"}")
        elif selector.startswith("@"):raise ValueError("Unsupported approved CSS at-rule.")
        else:
            scoped=[]
            for item in selector.split(","):
                item=item.strip()
                scoped.append("#almanack-approved" if item=="body" else "#almanack-approved, #almanack-approved *" if item=="*" else "#almanack-approved "+item)
            output.append(",".join(scoped)+"{"+inner+"}")
        cursor=end
    return "\n".join(output)+"\n"


def staged_source(source):
    text=source.decode("utf-8");front=re.match(r"\A---\r?\n(.*?)\r?\n---(?:\r?\n|\Z)",text,re.S)
    if not front or len(re.findall(r"(?m)^draft: true\s*$",front[1]))!=1 or re.search(r"(?im)^publishdate\s*:",front[1]):raise ValueError("Immediate release needs one draft:true and no publishDate.")
    return source.replace(b"draft: true",b"draft: false",1)


def bound_attributes(original,date):
    """Append only exact opt-in bindings; preserve every existing rule byte."""
    newline=b"\r\n" if b"\r\n" in original else b"\n"
    lines=original.decode("utf-8").splitlines();add=[]
    for rule in ("/assets/almanack/** -text","/assets/css/almanack-alternating-v1.css -text",f"/content/almanack/{date}.md -text"):
        pattern=rule.split()[0]
        existing=[line for line in lines if line.split() and line.split()[0]==pattern]
        if existing and existing!=[rule]:raise ValueError("Conflicting exact Git attributes for "+pattern)
        if not existing:add.append(rule.encode())
    if not add:return original
    return original+(b"" if not original or original.endswith(b"\n") else newline)+newline.join(add)+newline


def managed_cards(value):
    """Use only complete, approved source references already in issue metadata."""
    found={}
    def walk(item):
        if isinstance(item,dict):
            if item.get("image") and item.get("email_image") and item.get("image_alt"):
                ref=item["image"]
                if re.fullmatch(r"[a-z0-9][a-z0-9_/-]+",ref):
                    record={"ref":ref,"source_url":item["email_image"],"alt":item["image_alt"]}
                    if record["source_url"] in found and found[record["source_url"]]!=record:raise ValueError("Ambiguous managed image source.")
                    found[record["source_url"]]=record
            for child in item.values():walk(child)
        elif isinstance(item,list):
            for child in item:walk(child)
    walk(value);return found


def apply_payload(payload,root,validate_only=False):
    root=Path(root).resolve();others={key:value for key,value in payload.items() if key!=".gitattributes"}
    target=root/".gitattributes";existing=target.read_bytes() if target.exists() else b""
    date=next(re.fullmatch(r"content/almanack/(\d{4}-\d{2}-\d{2})[.]md",key)[1] for key in others if re.fullmatch(r"content/almanack/(\d{4}-\d{2}-\d{2})[.]md",key))
    desired=payload[".gitattributes"]
    if validate_only and existing!=desired:raise ValueError("Staged exact-text attributes are missing or stale.")
    if not validate_only and bound_attributes(existing,date)!=desired:raise ValueError("Git attributes changed since payload preparation; inspect before staging.")
    HELPER["apply_payload"](others,root,validate_only=validate_only)
    if not validate_only and existing!=desired:target.write_bytes(desired)


def prepare(package,expected_source,hugo):
    package=Path(package).resolve();HELPER["pinned_hugo"](hugo)
    source=(package/"web-archive.md").read_bytes()
    if sha(source)!=expected_source:raise ValueError("Approved source hash does not match the requested release.")
    email=json.loads((package/"email.json").read_text(encoding="utf-8"))
    record=json.loads((package/"full-issue.json").read_text(encoding="utf-8"));approved=(package/"full-issue.html").read_bytes()
    if email["source_sha256"]!=sha(source) or record["source_sha256"]!=sha(source) or record["html_sha256"]!=sha(approved) or record["email_html_sha256"]!=sha((package/"email.html").read_bytes()) or record["fidelity"]["status"]!="PASS":raise ValueError("Approved source/full-issue artifacts are stale.")
    content=email["content"];date=email["issue_date"]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}",date):raise ValueError("Invalid canonical issue date.")
    if content.get("almanack_layout")!=LAYOUT or record.get("layout")!=LAYOUT:raise ValueError("Unsupported full-issue layout.")
    parsed=HELPER["parse_with_hugo"](source,hugo)
    if parsed["params"]!=content or parsed["draft"] is not True or parsed["route"]!=f"/almanack/{date}/":raise ValueError("Canonical source, metadata and route disagree.")
    staged=staged_source(source);staged_info=HELPER["parse_with_hugo"](staged,hugo)
    expected=dict(content,draft=False)
    if staged_info["params"]!=expected or staged_info["draft"] is not False:raise ValueError("Staged source changed beyond the draft scalar.")
    tree=Tree(approved.decode());sheets=[n for n in tree.root.all() if n.tag=="article" and n.attrs.get("id")=="issue"]
    if len(sheets)!=1:raise ValueError("Approved artifact needs exactly one complete issue.")
    sheet=sheets[0];restored=[]
    for node in sheet.all():
        if node.tag=="img" and "data-source-src" in node.attrs:
            node.attrs["src"]=node.attrs.pop("data-source-src");node.attrs.pop("data-source-sha256",None);restored.append(node.attrs["src"])
    # The already-visible masthead is the page heading: no duplicate text title.
    parents=[n for n in [sheet,*sheet.all()] if any(isinstance(c,Node) and c.tag=="img" and c.attrs.get("src")==content["email_masthead"]["image_url"] for c in n.children)]
    if len(parents)!=1:raise ValueError("Approved paper masthead must occur once.")
    parent=parents[0];index=next(i for i,c in enumerate(parent.children) if isinstance(c,Node) and c.tag=="img" and c.attrs.get("src")==content["email_masthead"]["image_url"])
    heading=Node("h1",{"id":"almanack-title","aria-label":f"{content['title']} ~ {date} ~ Issue {email['issue_number']}","style":"margin:0;line-height:0;"}.items());heading.children=[parent.children[index]];parent.children[index]=heading
    # Email's hosted JPEGs remain unchanged there. Web display must use the
    # site's approved AVIF/WebP picture pipeline, not sharing derivatives.
    approved_images=managed_cards(content);managed=[]
    for parent in [sheet,*sheet.all()]:
        for index,node in enumerate(parent.children):
            if not isinstance(node,Node) or node.tag!="img" or node.attrs.get("src") not in approved_images:continue
            item=dict(approved_images[node.attrs["src"]])
            if node.attrs.get("alt")!=item["alt"]:raise ValueError("Approved artwork alt differs from source metadata.")
            presentation=node.attrs.get("style","")
            if not re.search(r"(?:^|;)\s*width\s*:",presentation) and node.attrs.get("width"):
                presentation+="width:"+node.attrs["width"]+"px;"
            token=f"<!--ALMANACK-MANAGED-IMAGE-{len(managed)}-->"
            item.update(token=token,display_style=presentation,loading="eager" if not managed else "lazy",fetchpriority="high" if not managed else "",sizes="104px" if node.attrs.get("width")=="104" else "(min-width:75.5rem) 680px, (max-width:61.25rem) calc(100vw - 6rem), 680px")
            managed.append(item);parent.children[index]=token
    fragment="".join(c.markup() if isinstance(c,Node) else c for c in sheet.children).encode()
    if re.search(rb"<script\b|data:image/|Private draft|Read-only|[A-Z]:[\\/]Users[\\/]|file:",fragment,re.I):raise ValueError("Private controls or embedded/local resources entered the public fragment.")
    styles="\n".join("".join(c for c in n.children if isinstance(c,str)) for n in tree.root.all() if n.tag=="style")
    css=scope_css(styles).encode()
    asset_root=f"assets/almanack/{date}"
    manifest={"schema":SCHEMA,"layout":LAYOUT,"issue_date":date,"issue_number":email["issue_number"],"approved_source_sha256":sha(source),"staged_source_sha256":sha(staged),"approved_full_issue_sha256":sha(approved),"fragment_sha256":sha(fragment),"css_sha256":sha(css),"template_signature":record["template_signature"],"managed_images":managed}
    assets=HELPER["issue_assets"](content,date,package)
    attributes=(ROOT/".gitattributes").read_bytes()
    payload={".gitattributes":bound_attributes(attributes,date),f"content/almanack/{date}.md":staged,f"{asset_root}/body.html":fragment,f"{asset_root}/manifest.json":dump(manifest),CSS_PATH:css,**{key:value[1] for key,value in assets.items()}}
    return payload,{"schema":"oip-almanack-immediate-web-stage/v1","status":"PASS","source_sha256":sha(source),"staged_source_sha256":sha(staged),"only_draft_scalar_changed":True,"source_package_remains_draft":True,"approved_full_issue_sha256":sha(approved),"restored_canonical_image_urls":restored,"artwork":{key:{"source":str(v[0]),"sha256":sha(v[1]),"width":v[2],"height":v[3]} for key,v in assets.items()},"allowlist":sorted(payload),"files":{key:{"sha256":sha(value),"bytes":len(value)} for key,value in payload.items()},"remote_write":False,"email_delivery":False}


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("action",choices=("stage","validate"));parser.add_argument("--package",type=Path,required=True);parser.add_argument("--approved-source-sha256",required=True);parser.add_argument("--hugo",type=Path,required=True);parser.add_argument("--report",type=Path,required=True)
    args=parser.parse_args()
    if args.report.resolve().is_relative_to(ROOT):parser.error("Keep release receipts outside the publication worktree.")
    payload,receipt=prepare(args.package,args.approved_source_sha256,args.hugo)
    apply_payload(payload,ROOT,validate_only=args.action=="validate")
    args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_bytes(dump(receipt));print(json.dumps({"status":"PASS","files":len(payload),"report":str(args.report)}))


if __name__=="__main__":main()
