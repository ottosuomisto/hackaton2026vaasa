import glob,os,pandas as pd,numpy as np,openpyxl
from datetime import datetime
SRC=os.path.join(os.path.dirname(os.path.abspath(__file__)),"..","..","..","Vilpe_Materiaalit")
ws=openpyxl.load_workbook(glob.glob(SRC+"/measurements_*.xlsx")[0],read_only=True).worksheets[0]
rows=list(ws.iter_rows(values_only=True)); print(rows[0])
L=pd.DataFrame(rows[1:],columns=["ts","sid","serial","n","b","bs","bn","t","rh","ah"]).dropna(subset=["rh"])
L["ts"]=pd.to_datetime(L.ts)
L.to_pickle(os.path.join(os.path.dirname(os.path.abspath(__file__)),"leak.pkl"))
COLS={"Rpm":"rpm","Ohjaava sisälähetin T (°C)":"tIn","Ohjaava sisälähetin H (%)":"rhIn","Ohjaava sisälähetin g/m³":"ahIn","Ohjaava ulkolähetin T (°C)":"tOut","Ohjaava ulkolähetin H (%)":"rhOut","Ohjaava ulkolähetin g/m³":"ahOut"}
U=[]
for f in sorted(glob.glob(SRC+"/VILPE Vantaa, *.xlsx")):
    rows=list(openpyxl.load_workbook(f,read_only=True).worksheets[0].iter_rows(values_only=True))
    hi=next(i for i,r in enumerate(rows) if r and r[0]=="Aikaleima" and "Rpm" in r)
    if f==sorted(glob.glob(SRC+"/VILPE Vantaa, *.xlsx"))[0]: print(rows[:hi+2])
    h=[COLS.get(x) for x in rows[hi]]
    recs=[]
    for r in rows[hi+1:]:
        if not r or not r[0]: continue
        d={k:v for k,v in zip(h,r) if k}; d["ts"]=datetime.strptime(r[0],"%Y/%m/%d %H:%M:%S"); recs.append(d)
    df=pd.DataFrame(recs); df["unit"]=os.path.basename(f).split("_")[0].replace("VILPE Vantaa, ",""); U.append(df)
M=pd.concat(U); M.to_pickle(os.path.join(os.path.dirname(os.path.abspath(__file__)),"mcu.pkl")); print(M.groupby("unit").ts.agg(["min","max","count"]))
