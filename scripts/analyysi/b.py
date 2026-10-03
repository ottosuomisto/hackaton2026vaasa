import pandas as pd,numpy as np,os
pd.set_option("display.width",200)
M=pd.read_pickle(os.path.join(os.path.dirname(os.path.abspath(__file__)),"mcu.pkl"))
for c in ["rpm","tIn","rhIn","ahIn","tOut","rhOut","ahOut"]: M[c]=pd.to_numeric(M[c],errors="coerce")
M["m"]=M.ts.dt.strftime("%Y-%m")
print("== Sisä-AH ja RH kuukausittain per yksikkö")
print(M.pivot_table(index="m",columns="unit",values="rhIn",aggfunc="mean").round(1))
print(M.pivot_table(index="m",columns="unit",values="ahIn",aggfunc="mean").round(2))
print("== ulko AH/T kk"); print(M.groupby("m")[["tOut","rhOut","ahOut"]].mean().round(2))
# delta AH in-out
M["dAH"]=M.ahIn-M.ahOut
print("== sisä-AH - ulko-AH kk"); print(M.pivot_table(index="m",columns="unit",values="dAH",aggfunc="mean").round(2))
# same-season YoY: Jun15-Sep10 2025 vs 2026
def per(a,b): return M[(M.ts>=a)&(M.ts<b)].groupby("unit")[["rhIn","ahIn","tIn","ahOut","tOut","dAH"]].mean().round(2)
print("== 2025 kesä 18.6-10.9"); print(per("2025-06-18","2025-09-11"))
print("== 2026 kesä 18.6-10.9"); print(per("2026-06-18","2026-09-11"))
# water removal: sum over records with rpm>0 of dAH * dt(h); flow assume proportional to rpm, 
M=M.sort_values(["unit","ts"]); M["dt"]=M.groupby("unit").ts.diff().dt.total_seconds()/3600
M.loc[M.dt>6,"dt"]=np.nan
print(M.rpm.describe())
for unit,g in M.groupby("unit"):
    on=g[g.rpm>0]
    print(unit,"rpm ka kun päällä",round(on.rpm.mean()),"h päällä",round(on.dt.sum()),"sum dAH*h (g·h/m3) kun päällä",round((on.dAH*on.dt).sum()), "dAH>0 share",round((g.dAH>0).mean(),2))
M.to_pickle(os.path.join(os.path.dirname(os.path.abspath(__file__)),"mcu2.pkl"))
