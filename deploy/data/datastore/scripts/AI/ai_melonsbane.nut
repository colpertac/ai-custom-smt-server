function define(script)
{
    script.Name = "melonsBane";
    script.Type = "AI";
    return 0;
}

function prepare(eState, manager)
{
    local aiState = eState.GetAIState();
    aiState.SetActionOverridesEntry("target", "melonSeeking");
    return 0;
}

function melonSeeking(eState, possibleTargets, manager, now)
{
    local valid = [];

    for(local i = 0; i < possibleTargets.len(); i++)
    {
        local enemyState = EnemyState.Cast(possibleTargets[i]);
        local enemy = enemyState != null ? enemyState.GetEntity() : null;
        if(enemy && enemy.GetType() == 5385)
        {
            valid.append(enemyState.GetEntityID());
        }
    }

    return valid.len() > 0 ? valid[Randomizer.RNG(0, valid.len() - 1)] : 0;
}