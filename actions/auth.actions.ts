"use server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { registerSchema, loginSchema, resetPasswordRequestSchema, resetPasswordConfirmSchema } from "@/lib/validation/auth.schema";
export type ActionResult<T=undefined>={ok:true;data:T}|{ok:false;error:string;fieldErrors?:Record<string,string[]>};

export async function registerAction(input:unknown):Promise<ActionResult>{
 try{
  const parsed=registerSchema.safeParse(input);
  if(!parsed.success)return{ok:false,error:"Please check the information you entered.",fieldErrors:parsed.error.flatten().fieldErrors};
  const {email,password,username,displayName}=parsed.data;
  const supabase=createServerSupabaseClient();
  const origin=process.env.NEXT_PUBLIC_APP_URL||"https://creatorfix-lsag-git-main-creatorfixglobal.vercel.app";
  const {data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:`${origin}/login`,data:{username,display_name:displayName}}});
  if(error)return{ok:false,error:error.message};
  if(!data.user)return{ok:false,error:"Registration could not create a user. Please try again."};
  return{ok:true,data:undefined};
 }catch(e){return{ok:false,error:e instanceof Error?e.message:"Registration service is temporarily unavailable."}}
}
export async function loginAction(input:unknown):Promise<ActionResult>{try{const p=loginSchema.safeParse(input);if(!p.success)return{ok:false,error:"Please enter a valid email and password."};const s=createServerSupabaseClient();const{error}=await s.auth.signInWithPassword(p.data);return error?{ok:false,error:error.message}:{ok:true,data:undefined}}catch(e){return{ok:false,error:e instanceof Error?e.message:"Login service unavailable"}}}
export async function logoutAction():Promise<ActionResult>{try{const s=createServerSupabaseClient();const{error}=await s.auth.signOut();return error?{ok:false,error:error.message}:{ok:true,data:undefined}}catch(e){return{ok:false,error:"Logout failed"}}}
export async function requestPasswordResetAction(input:unknown):Promise<ActionResult>{try{const p=resetPasswordRequestSchema.safeParse(input);if(!p.success)return{ok:false,error:"Invalid email address"};const s=createServerSupabaseClient();const{error}=await s.auth.resetPasswordForEmail(p.data.email,{redirectTo:`${process.env.NEXT_PUBLIC_APP_URL||"https://creatorfix-lsag-git-main-creatorfixglobal.vercel.app"}/reset-password/confirm`});return error?{ok:false,error:error.message}:{ok:true,data:undefined}}catch(e){return{ok:false,error:"Password reset service unavailable"}}}
export async function confirmPasswordResetAction(input:unknown):Promise<ActionResult>{try{const p=resetPasswordConfirmSchema.safeParse(input);if(!p.success)return{ok:false,error:"Invalid password"};const s=createServerSupabaseClient();const{error}=await s.auth.updateUser({password:p.data.password});return error?{ok:false,error:error.message}:{ok:true,data:undefined}}catch(e){return{ok:false,error:"Password update failed"}}}