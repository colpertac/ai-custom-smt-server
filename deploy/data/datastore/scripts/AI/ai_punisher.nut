function define(script)
{
    script.Name = "punisher";
    script.Type = "AI";
    return 0;
}

function prepare(eState, manager)
{
    local aiState = eState.GetAIState();
    aiState.SetActionOverridesEntry("combatSkillHit", "");
    return 0;
}

function combatSkillHit(eState, manager, source, skillData)
{
    local aiState = eState.GetAIState();

    local skillIDsStr = aiState.GetActionOverridesByKey("CounterSkill");
    local skillIDs = skillIDsStr != "" ? split(skillIDsStr, ",") : null;
    if(skillIDs != null && skillIDs.len() > 0)
    {
        local actionType = aiState.GetActionOverridesByKey("CounterActionType").tointeger();
        if(actionType == -1 || skillData.GetBasic().ActionType == actionType)
        {
            local skillID = skillIDs[Randomizer.RNG(0, skillIDs.len() - 1)];
            manager.QueueUseSkillCommand(eState, skillID.tointeger(), -1, false);
        }
    }

    return 1;
}