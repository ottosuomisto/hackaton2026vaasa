import pandas as pd,numpy as np,os
pd.set_option("display.width",220); pd.set_option("display.max_columns",20)
M=pd.read_pickle(os.path.join(os.path.dirname(os.path.abspath(__file__)),"mcu2.pkl"))
print("== rpm kk-keskiarvo"); print(M.pivot_table(index="m",columns="unit",values="rpm",aggfunc="mean").round(0))
M["wet_in"]=M.dAH<0
g=M[M.rpm>0].groupby("unit").agg(h_on=("dt","sum"))
g["h_on_out_wetter"]=M[(M.rpm>0)&(M.dAH<0)].groupby("unit").dt.sum()
g["share"]=g.h_on_out_wetter/g.h_on
g["rpm_when_dry_possible"]=M[(M.rpm>0)&(M.dAH>0)].groupby("unit").rpm.mean()
g["rpm_when_out_wetter"]=M[(M.rpm>0)&(M.dAH<0)].groupby("unit").rpm.mean()
print(g.round(2))
# leak sensors
L=pd.read_pickle(os.path.join(os.path.dirname(os.path.abspath(__file__)),"leak.pkl"))
for c in ["t","rh","ah"]: L[c]=pd.to_numeric(L[c])
print(L.ts.min(),L.ts.max())
a=L[(L.ts<"2025-10-01")]; b=L[(L.ts>="2026-08-21")]
print("start",a.ts.min(),a.ts.max(),a[["t","rh","ah"]].mean().round(2).to_dict())
b2=L[(L.ts>="2026-09-01")]
print("2026-09 1-11",b2[["t","rh","ah"]].mean().round(2).to_dict())
a2=L[(L.ts<"2025-09-22")]; print("2025-09 11-21",a2[["t","rh","ah"]].mean().round(2).to_dict())
# outdoor same windows
o=M.groupby(M.ts.dt.floor("D"))[["tOut","ahOut"]].mean()
print("out 2025-09-11..21",o.loc["2025-09-11":"2025-09-21"].mean().round(2).to_dict(),"out 2026-09-01..11",o.loc["2026-09-01":"2026-09-11"].mean().round(2).to_dict())
# thermal coupling: daily sensor T vs daily outdoor T, Dec-Feb
L["d"]=L.ts.dt.floor("D")
D=L.groupby(["serial","d"]).t.mean().reset_index().merge(o.reset_index().rename(columns={"ts":"d"}),on="d")
W=D[(D.d>="2025-12-01")&(D.d<"2026-03-01")]
res=[]
for s,g2 in W.groupby("serial"):
    if len(g2)<30: continue
    b_,a_=np.polyfit(g2.tOut,g2.t,1)
    res.append((s,round(b_,3),round(a_,2),round(g2.t.mean(),2),round(g2.t.min(),2),len(g2)))
R=pd.DataFrame(res,columns=["serial","slope","icpt","tmean","tmin","n"]).sort_values("slope",ascending=False)
print(R.head(8)); print(R.tail(4)); print(R.slope.describe().round(3))
# coldest day
cd=o.loc["2025-12-01":"2026-03-01"].tOut.idxmin(); print("kylmin päivä",cd,o.loc[cd].round(1).to_dict())
x=D[D.d==cd].t; print("anturit kylmimpänä päivänä: ka",round(x.mean(),2),"min",round(x.min(),2),"median",round(x.median(),2))
R.to_csv(os.path.join(os.path.dirname(os.path.abspath(__file__)),"thermal.csv"),index=False)
