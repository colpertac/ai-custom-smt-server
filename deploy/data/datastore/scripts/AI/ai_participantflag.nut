function define(script)
{
    script.Name = "participantFlag";
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
    local eBase = eState.GetEnemyBase();
    local zone = eState.GetZone();
    local worldCID = source.GetWorldCID();
    if(eBase && zone && worldCID > 0)
    {
        zone.SetFlagState(eBase.GetType(), 1, worldCID);
    }

    return 1;
}