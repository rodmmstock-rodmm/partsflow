import {createContext,useContext,useEffect,useMemo,useState} from "react";
import {apiGet,apiPost} from "./api";
const C=createContext(null);
export function AuthProvider({children}){const[employee,setEmployee]=useState(null);const[loading,setLoading]=useState(true);
async function refresh(){const d=await apiGet("/auth/me/");setEmployee(d.employee);return d.employee}
useEffect(()=>{refresh().catch(()=>setEmployee(null)).finally(()=>setLoading(false))},[]);
async function login(code){const d=await apiPost("/auth/login/",{employee_code:code});setEmployee(d.employee);return d.employee}
async function logout(){try{await apiPost("/auth/logout/")}finally{setEmployee(null)}}
const v=useMemo(()=>({employee,loading,authenticated:!!employee,login,logout,refresh,can:k=>!!employee?.permissions?.[k]}),[employee,loading]);
return <C.Provider value={v}>{children}</C.Provider>}
export function useAuth(){return useContext(C)}
