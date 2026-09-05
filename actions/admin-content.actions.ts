"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const slugSchema=z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens.");

const platformSchema=z.object({
  name:z.string().trim().min(2).max(80),
  slug:slugSchema,
  description:z.string().trim().max(500).optional().or(z.literal(""))
});

const problemSchema=z.object({
  platformId:z.string().uuid(),
  title:z.string().trim().min(3).max(160),
  slug:slugSchema,
  shortDescription:z.string().trim().max(500).optional().or(z.literal("")),
  fullDescription:z.string().trim().max(5000).optional().or(z.literal(""))
});

async function adminClient(){
  await requireRole(["admin"]);
  return createAdminSupabaseClient();
}

export async function createPlatformAction(input:unknown){
  const parsed=platformSchema.safeParse(input);
  if(!parsed.success) return {ok:false,error:parsed.error.issues[0]?.message||"Invalid platform data."};
  const admin=await adminClient();
  const {error}=await admin.from("platforms").insert({
    name:parsed.data.name,slug:parsed.data.slug,description:parsed.data.description||null,status:"active"
  });
  if(error) return {ok:false,error:error.message};
  return {ok:true};
}

export async function setPlatformStatusAction(id:string,status:"active"|"suspended"){
  if(!z.string().uuid().safeParse(id).success) return {ok:false,error:"Invalid platform ID."};
  const admin=await adminClient();
  const {error}=await admin.from("platforms").update({status}).eq("id",id);
  return error?{ok:false,error:error.message}:{ok:true};
}

export async function createProblemAction(input:unknown){
  const parsed=problemSchema.safeParse(input);
  if(!parsed.success) return {ok:false,error:parsed.error.issues[0]?.message||"Invalid problem data."};
  const admin=await adminClient();
  const {error}=await admin.from("problems").insert({
    platform_id:parsed.data.platformId,title:parsed.data.title,slug:parsed.data.slug,
    short_description:parsed.data.shortDescription||null,full_description:parsed.data.fullDescription||null,status:"draft"
  });
  if(error) return {ok:false,error:error.message};
  return {ok:true};
}

export async function setProblemStatusAction(id:string,status:"draft"|"published"|"archived"){
  if(!z.string().uuid().safeParse(id).success) return {ok:false,error:"Invalid problem ID."};
  const admin=await adminClient();
  const {error}=await admin.from("problems").update({status}).eq("id",id);
  return error?{ok:false,error:error.message}:{ok:true};
}
