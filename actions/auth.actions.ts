"use server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { registerSchema, loginSchema, resetPasswordRequestSchema, resetPasswordConfirmSchema } from "@/lib/validation/auth.schema";
export type ActionResult<T=undefined>={ok:true;data:T}|{ok:false;error:string;fieldErrors?:Record<string,string[]>};

export async function registerAction(input:unknown):Promise<ActionResult>{
 const parsed=registerSchema.safeParse(input);
 if(!parsed.success)return{ok:false,error:"Please check the information you entered.",fieldErrors:parsed.error.flatten().fieldErrors};
 const {email,password,username,displayName}=parsed.data;
 const supabase=createServerSupabaseClient();
 const origin=process.env.NEXT_PUBLIC_APP_URL||process.env.VERCEL_URL&&`https://${process.env.VERCEL_URL}`;
 const {data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:`${origin||"http://localhost:3000"}/login`,data:{username,display_name:displayName}}});
 if(error||!data.user)return{ok:false,error:error?.message||"Registration failed. Please try again."};
 try{
   const admin=createAdminSupabaseClient();
   const {error:profileError}=await admin.from("profiles").upsert({auth_user_id:data.user.id,role:"customer",username,display_name:displayName,email,status:"active"},{onConflict:"auth_user_id"});
   if(profileError)return{ok:false,error:"Account was created, but profile setup failed: "+profileError.message};
   const {data:profile}=await admin.from("profiles").select("id").eq("auth_user_id",data.user.id).single();
   if(profile) await admin.from("wallets").upsert({user_id:profile.id,balance:0,reserved_balance:0},{onConflict:"user_id"});
 }catch(e){return{ok:false,error:e instanceof Error?e.message:"Server configuration error during registration"}}
 return{ok:true,data:undefined};
}
export async function loginAction(input:unknown):Promise<ActionResult>{
 const parsed=loginSchema.safeParse(input);if(!parsed.success)return{ok:false,error:"Please enter a valid email and password."};
 const supabase=createServerSupabaseClient();const {error}=await supabase.auth.signInWithPassword(parsed.data);
 if(error)return{ok:false,error:"Incorrect email or password."};return{ok:true,data:undefined};
}
export async function logoutAction():Promise<ActionResult>{const s=createServerSupabaseClient();const{error}=await s.auth.signOut();return error?{ok:false,error:error.message}:{ok:true,data:undefined}}
export async function requestPasswordResetAction(input:unknown):Promise<ActionResult>{const p=resetPasswordRequestSchema.safeParse(input);if(!p.success)return{ok:false,error:"Invalid email address"};const s=createServerSupabaseClient();await s.auth.resetPasswordForEmail(p.data.email,{redirectTo:`${process.env.NEXT_PUBLIC_APP_URL||"http://localhost:3000"}/reset-password/confirm`});return{ok:true,data:undefined}}
export async function confirmPasswordResetAction(input:unknown):Promise<ActionResult>{const p=resetPasswordConfirmSchema.safeParse(input);if(!p.success)return{ok:false,error:"Invalid password"};const s=createServerSupabaseClient();const{error}=await s.auth.updateUser({password:p.data.password});return error?{ok:false,error:error.message}:{ok:true,data:undefined}}