function define(script)
{
    script.Name = "action_spawnNear";
    script.Type = "ActionCustom";
    return 0;
}

// Spawn an enemy near the current source entity, accounting for zone geometry
// - params[0]+: Valid spawn IDs (one is randomly chosen)
function run(source, cState, dState, zone, server, params)
{
    if(params.len() < 1 || zone == null || source == null)
    {
        return Result_t.FAIL;
    }

    local xPos1 = source.GetCurrentX();
    local yPos1 = source.GetCurrentY();

    local zoneManager = server.GetZoneManager();
    local spawnID = params[Randomizer.RNG(0, params.len() - 1)].tointeger();
    local enemy = zoneManager.CreateEnemy(zone, 0, spawnID, 0,
        xPos1, yPos1, Randomizer.RNG(-314159, 314159) * 0.00001);
    if(enemy == null)
    {
        return Result_t.FAIL;
    }

    // Extend and rotate the point around the source 800 units out
    local radians = Randomizer.RNG(-314159, 314159) * 0.00001;

    local xPos2 = (800.0 * cos(radians)) + xPos1;
    local yPos2 = (800.0 * sin(radians)) + yPos1;

    zoneManager.LinearReposition(enemy, xPos2, yPos2);

    local enemyList = [ enemy ];
    if(zoneManager.AddEnemiesToZone(enemyList, zone, true, true, ""))
    {
        local aiState = enemy.GetAIState();
        aiState.SetDespawnWhenLost(false);
        aiState.SetStatus(AIStatus_t.WANDERING, true);

        return Result_t.SUCCESS;
    }

    return Result_t.FAIL;
}