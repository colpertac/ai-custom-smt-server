function define(script)
{
    script.Name = "traitor";
    script.Type = "AI";
    return 0;
}

function prepare(eState, manager)
{
    local aiState = eState.GetAIState();
    aiState.SetActionOverridesEntry("target", "badTeammate");
    return 0;
}

function badTeammate(eState, possibleTargets, manager, now)
{
    local valid = [];

    for(local i = 0; i < possibleTargets.len(); i++)
    {
        local enemyState = EnemyState.Cast(possibleTargets[i]);
        if(enemyState != null)
        {
            valid.append(enemyState.GetEntityID());
        }
    }

    return valid.len() > 0 ? valid[Randomizer.RNG(0, valid.len() - 1)] : 0;
}