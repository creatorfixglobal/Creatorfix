import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getSupabaseConfig(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to Vercel Production.");
 return {url,key};
}
export function createServerSupabaseClient(){
 const cookieStore=cookies(); const {url,key}=getSupabaseConfig();
 return createServerClient(url,key,{cookies:{getAll(){return cookieStore.getAll()},setAll(cookiesToSet){try{cookiesToSet.forEach(({name,value,options})=>cookieStore.set(name,value,options))}catch{}}}});
}