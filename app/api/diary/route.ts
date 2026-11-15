import { endpoint } from "@/lib/auth";
import { deleteDiary, listDiary, putDiary } from "@/lib/diary";

export const dynamic = "force-dynamic";
export const GET = endpoint(listDiary);
export const PUT = endpoint(putDiary);
export const DELETE = endpoint(deleteDiary);
