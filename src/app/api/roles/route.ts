import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { roles, roleSkills, skills } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

// GET /api/roles - List all roles with their skills
export async function GET() {
  const allRoles = db.select().from(roles).all();

  // Get skills for each role
  const rolesWithSkills = allRoles.map((role) => {
    const roleSkillRows = db
      .select({ skillId: roleSkills.skillId })
      .from(roleSkills)
      .where(eq(roleSkills.roleId, role.id))
      .all();

    const skillIds = roleSkillRows.map((rs) => rs.skillId);
    const roleSkillsData =
      skillIds.length > 0
        ? db
            .select()
            .from(skills)
            .where(inArray(skills.id, skillIds))
            .all()
        : [];

    return {
      ...role,
      workflow: role.workflow ? JSON.parse(role.workflow) : [],
      tools: role.tools ? JSON.parse(role.tools) : [],
      folderAccess: role.folderAccess ? JSON.parse(role.folderAccess) : [],
      skillDefinitions: role.skillDefinitions ? JSON.parse(role.skillDefinitions) : [],
      skills: roleSkillsData,
    };
  });

  return NextResponse.json(rolesWithSkills);
}

// POST /api/roles - Create a new role
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { slug, title, description, color, icon, workflow, systemPrompt, skillIds, tools, folderAccess, skillDefinitions } = body;

  if (!slug?.trim() || !title?.trim()) {
    return NextResponse.json(
      { error: "Slug and title are required" },
      { status: 400 }
    );
  }

  // Create the role
  const result = db
    .insert(roles)
    .values({
      slug: slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      title: title.trim(),
      description: description?.trim() || null,
      color: color || "#6366f1",
      icon: icon || null,
      workflow: workflow ? JSON.stringify(workflow) : null,
      systemPrompt: systemPrompt?.trim() || null,
      tools: tools ? JSON.stringify(tools) : null,
      folderAccess: folderAccess ? JSON.stringify(folderAccess) : null,
      skillDefinitions: skillDefinitions ? JSON.stringify(skillDefinitions) : null,
    })
    .returning()
    .get();

  // Attach skills if provided
  if (skillIds && skillIds.length > 0) {
    for (const skillId of skillIds) {
      db.insert(roleSkills)
        .values({ roleId: result.id, skillId })
        .run();
    }
  }

  // Fetch the complete role with skills
  const roleSkillRows = db
    .select({ skillId: roleSkills.skillId })
    .from(roleSkills)
    .where(eq(roleSkills.roleId, result.id))
    .all();

  const skillIdsFromDb = roleSkillRows.map((rs) => rs.skillId);
  const roleSkillsData =
    skillIdsFromDb.length > 0
      ? db
          .select()
          .from(skills)
          .where(inArray(skills.id, skillIdsFromDb))
          .all()
      : [];

  return NextResponse.json({
    ...result,
    workflow: result.workflow ? JSON.parse(result.workflow) : [],
    tools: result.tools ? JSON.parse(result.tools) : [],
    folderAccess: result.folderAccess ? JSON.parse(result.folderAccess) : [],
    skillDefinitions: result.skillDefinitions ? JSON.parse(result.skillDefinitions) : [],
    skills: roleSkillsData,
  });
}

// PUT /api/roles - Update a role
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, slug, title, description, color, icon, workflow, systemPrompt, skillIds, tools, folderAccess, skillDefinitions } = body;

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  // Update role fields
  const result = db
    .update(roles)
    .set({
      ...(slug && { slug: slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") }),
      ...(title && { title: title.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(color && { color }),
      ...(icon !== undefined && { icon: icon || null }),
      ...(workflow !== undefined && { workflow: workflow ? JSON.stringify(workflow) : null }),
      ...(systemPrompt !== undefined && { systemPrompt: systemPrompt?.trim() || null }),
      ...(tools !== undefined && { tools: tools ? JSON.stringify(tools) : null }),
      ...(folderAccess !== undefined && { folderAccess: folderAccess ? JSON.stringify(folderAccess) : null }),
      ...(skillDefinitions !== undefined && { skillDefinitions: skillDefinitions ? JSON.stringify(skillDefinitions) : null }),
    })
    .where(eq(roles.id, id))
    .returning()
    .get();

  // Update skills if provided
  if (skillIds !== undefined) {
    // Remove all existing skills
    db.delete(roleSkills).where(eq(roleSkills.roleId, id)).run();

    // Add new skills
    for (const skillId of skillIds) {
      db.insert(roleSkills)
        .values({ roleId: id, skillId })
        .run();
    }
  }

  // Fetch the complete role with skills
  const roleSkillRows = db
    .select({ skillId: roleSkills.skillId })
    .from(roleSkills)
    .where(eq(roleSkills.roleId, id))
    .all();

  const skillIdsFromDb = roleSkillRows.map((rs) => rs.skillId);
  const roleSkillsData =
    skillIdsFromDb.length > 0
      ? db
          .select()
          .from(skills)
          .where(inArray(skills.id, skillIdsFromDb))
          .all()
      : [];

  return NextResponse.json({
    ...result,
    workflow: result.workflow ? JSON.parse(result.workflow) : [],
    tools: result.tools ? JSON.parse(result.tools) : [],
    folderAccess: result.folderAccess ? JSON.parse(result.folderAccess) : [],
    skillDefinitions: result.skillDefinitions ? JSON.parse(result.skillDefinitions) : [],
    skills: roleSkillsData,
  });
}

// DELETE /api/roles - Delete a role
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  // Delete role (cascade will handle role_skills)
  db.delete(roles).where(eq(roles.id, parseInt(id))).run();
  return NextResponse.json({ success: true });
}
