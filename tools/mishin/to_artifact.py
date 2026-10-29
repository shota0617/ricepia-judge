# mishin.html を Artifact（claude.ai の ページ）用に する：<!DOCTYPE>・<html>・<head>・<body> を はずし、charset・viewport の meta を とる
#   python3 tools/mishin/to_artifact.py mishin.html <書き出す 先>.html
import re,sys
s=open(sys.argv[1], encoding='utf-8').read()
head=s[s.index('<head>')+6:s.index('</head>')]
body=s[s.index('<body>')+6:s.index('</body>')]
head=re.sub(r'<meta charset[^>]*>\n?','',head); head=re.sub(r'<meta name="viewport"[^>]*>\n?','',head)
open(sys.argv[2],'w',encoding='utf-8').write(head.strip()+'\n'+body.strip()+'\n')
