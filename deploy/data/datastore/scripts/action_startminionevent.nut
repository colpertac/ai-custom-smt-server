function define(script)
{
    script.Name = "action_startMinionEvent";
    script.Type = "ActionCustom";
    return 0;
}

// Start an event for all minion entities in the zone for the source entity
// - params[0]: Event ID
function run(source, cState, dState, zone, server, params)
{
    if(zone == null || source == null)
    {
        return Result_t.FAIL;
    }

    local summonerID = source.GetEntityID();
    local aiManager = server.GetAIManager();

    local entities = zone.GetAllies();
    foreach(entity in entities)    
    {
        if(entity.GetEnemyBase().GetSummonerID() == summonerID)
        {
            aiManager.StartEvent(entity, params[0]);
        }
    }

    entities = zone.GetEnemies();
    foreach(entity in entities)    
    {
        if(entity.GetEnemyBase().GetSummonerID() == summonerID)
        {
            aiManager.StartEvent(entity, params[0]);
        }
    }

    return Result_t.SUCCESS;
}