"use server";

import { requireRole } from "@/lib/auth/require-role";
import { requireVerified } from "@/lib/auth/require-verified";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { z } from "zod";
import type { ActionResult } from "@/actions/auth.actions";

const applyProviderSchema = z.object({
  bio: z.string().trim().min(20, "Tell us a bit more about your experience").max(2000),
  skills: z.array(z.string().trim().min(1)).min(1, "List at least one skill").max(20),
});
const securityDepositSchema=z.object({
  paymentMethod:z.enum(["bkash","nagad","bank"]),
  paymentReference:z.string().trim().min(4).max(120)
});

export async function submitProviderSecurityDepositAction(input: unknown): Promise<ActionResult> {
  const profile=await requireRole(["customer"]);
  await requireVerified(profile);
  const parsed=securityDepositSchema.safeParse(input);
  if(!parsed.success) return {ok:false,error:"Provide a valid payment method and transaction reference."};

  const supabase=createServerSupabaseClient();
  const {data:existing}=await supabase.from("provider_security_deposits").select("status").eq("user_id",profile.id).maybeSingle();
  if(existing?.status==="held") return {ok:false,error:"Your BDT 1,000 security deposit is already held."};
  if(existing?.status==="pending") return {ok:false,error:"Your security deposit is already awaiting admin verification."};
  if(existing?.status==="release_requested"||existing?.status==="released") return {ok:false,error:"This provider security deposit cannot be reused. Contact support to reactivate the provider program."};
  if(existing?.status==="rejected") return {ok:false,error:"Your previous deposit was rejected. Contact support for a new verification cycle."};

  const {error}=await supabase.from("provider_security_deposits").insert({
    user_id:profile.id,amount:100000,payment_method:parsed.data.paymentMethod,payment_reference:parsed.data.paymentReference,status:"pending"
  });
  if(error) return {ok:false,error:error.message};
  return {ok:true,data:undefined};
}

export async function requestProviderSecurityDepositReleaseAction(): Promise<ActionResult> {
  const profile=await requireRole(["provider"]);
  const admin=createAdminSupabaseClient();
  const {error}=await admin.rpc("request_provider_security_deposit_release",{p_user_id:profile.id});
  if(error) return {ok:false,error:error.message};
  return {ok:true,data:undefined};
}

export async function applyToBecomeProviderAction(input: unknown): Promise<ActionResult> {
  const profile = await requireRole(["customer"]);
  await requireVerified(profile);
  const parsed = applyProviderSchema.safeParse(input);
  if (!parsed.success) return {ok:false,error:"Invalid input",fieldErrors:parsed.error.flatten().fieldErrors};

  const supabase = createServerSupabaseClient();
  const {data:deposit}=await supabase.from("provider_security_deposits").select("status,amount").eq("user_id",profile.id).maybeSingle();
  if(!deposit || deposit.status!=="held" || deposit.amount!==100000){
    return {ok:false,error:"A verified BDT 1,000 security deposit must be held before you can submit a provider application."};
  }

  const { data: existing } = await supabase.from("provider_applications").select("id, status").eq("user_id", profile.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if (existing?.status === "submitted") return {ok:false,error:"You already have a pending application."};
  if (existing?.status === "approved") return {ok:false,error:"You are already an approved provider."};

  const { error } = await supabase.from("provider_applications").insert({user_id:profile.id,bio:parsed.data.bio,skills:parsed.data.skills,status:"submitted"});
  if (error) return {ok:false,error:error.message};
  return {ok:true,data:undefined};
}

export async function approveProviderApplicationAction(applicationId:string):Promise<ActionResult>{
  const admin_=await requireRole(["admin"]); const admin=createAdminSupabaseClient();
  const {error}=await admin.rpc("approve_provider_application",{p_application_id:applicationId,p_admin_id:admin_.id});
  if(error)return {ok:false,error:error.message}; return {ok:true,data:undefined};
}

export async function rejectProviderApplicationAction(applicationId:string,reason:string):Promise<ActionResult>{
  const admin_=await requireRole(["admin"]); const admin=createAdminSupabaseClient();
  const {error}=await admin.rpc("reject_provider_application",{p_application_id:applicationId,p_admin_id:admin_.id,p_reason:reason});
  if(error)return {ok:false,error:error.message}; return {ok:true,data:undefined};
}

export async function approveProviderSecurityDepositAction(depositId:string):Promise<ActionResult>{
  const admin_=await requireRole(["admin"]); const admin=createAdminSupabaseClient();
  const {error}=await admin.rpc("approve_provider_security_deposit",{p_deposit_id:depositId,p_admin_id:admin_.id});
  if(error)return {ok:false,error:error.message}; return {ok:true,data:undefined};
}

export async function rejectProviderSecurityDepositAction(depositId:string,reason:string):Promise<ActionResult>{
  const admin_=await requireRole(["admin"]); const admin=createAdminSupabaseClient();
  const {error}=await admin.rpc("reject_provider_security_deposit",{p_deposit_id:depositId,p_admin_id:admin_.id,p_reason:reason});
  if(error)return {ok:false,error:error.message}; return {ok:true,data:undefined};
}

export async function releaseProviderSecurityDepositAction(depositId:string):Promise<ActionResult>{
  const admin_=await requireRole(["admin"]); const admin=createAdminSupabaseClient();
  const {error}=await admin.rpc("release_provider_security_deposit",{p_deposit_id:depositId,p_admin_id:admin_.id});
  if(error)return {ok:false,error:error.message}; return {ok:true,data:undefined};
}